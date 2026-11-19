import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { harnessIdSchema } from "@codexhost/shared-contracts";

import { ClaudeCodeAdapter } from "../src/claude-code-adapter.js";
import { ClaudeSessionImportIndex } from "../src/claude-session-import.js";
import type { ClaudeAdapterDependencies, ClaudeSessionMetadata } from "../src/transport.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "codexhost-claude-import-")));
  roots.push(root);
  const cwd = path.join(root, "project");
  await mkdir(cwd);
  const environment = { CLAUDE_CONFIG_DIR: path.join(root, "claude") };
  return { root, cwd, environment };
}

function metadata(cwd: string, overrides: Partial<ClaudeSessionMetadata> = {}) {
  return {
    sessionId: "claude-native-session",
    summary: "Native summary",
    lastModified: 1_767_225_600_123,
    cwd,
    ...overrides,
  } satisfies ClaudeSessionMetadata;
}

describe("Claude native Session import discovery", () => {
  it("maps SDK metadata to a resumable source without reading Transcript content", async () => {
    const { cwd, environment } = await fixture();
    const listSessions = vi.fn(async () => [
      metadata(cwd, {
        customTitle: "  Custom\0 title  ",
        firstPrompt: "private prompt",
      }),
    ]);
    const getSessionInfo = vi.fn(async () => metadata(cwd));
    const index = new ClaudeSessionImportIndex(
      {
        listSessions,
        getSessionInfo,
        isRunning: () => false,
        readSessionMessages: async () => [],
      },
      environment,
    );

    await expect(index.list(new AbortController().signal)).resolves.toEqual([
      {
        candidate: {
          nativeSessionId: "claude-native-session",
          cwd,
          title: "Custom title",
          updatedAt: 1_767_225_600_123,
          running: null,
        },
        nativeRef: {
          harnessId: "claude-code",
          nativeSessionId: "claude-native-session",
          formatVersion: 1,
        },
      },
    ]);
    expect(listSessions).toHaveBeenCalledOnce();
    expect(getSessionInfo).not.toHaveBeenCalled();
  });

  it("skips invalid and ambiguous Sessions without hiding unrelated ones", async () => {
    const { root, cwd, environment } = await fixture();
    const projects = path.join(environment.CLAUDE_CONFIG_DIR, "projects");
    const duplicate = "claude-native-session";
    const conflictingFile = path.join(projects, "other-project", `${duplicate}.jsonl`);
    const originalFile = path.join(projects, "project", `${duplicate}.jsonl`);
    await Promise.all(
      [originalFile, conflictingFile].map(async (file) => {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, "not valid JSON\n");
      }),
    );
    const index = new ClaudeSessionImportIndex(
      {
        listSessions: async () => [
          metadata(cwd),
          metadata(cwd, { sessionId: "unrelated" }),
          metadata("relative/path", { sessionId: "relative" }),
          metadata(path.join(root, "missing"), { sessionId: "missing" }),
          metadata(cwd, { sessionId: "bad-time", lastModified: Number.NaN }),
        ],
        getSessionInfo: async ({ sessionId }) => metadata(cwd, { sessionId }),
        isRunning: () => false,
        readSessionMessages: async () => [],
      },
      environment,
    );
    const signal = new AbortController().signal;
    await expect(index.resolve(duplicate, signal)).rejects.toThrow("ambiguous");
    expect((await index.list(signal)).map(({ candidate }) => candidate.nativeSessionId)).toEqual([
      "unrelated",
    ]);
    await rm(conflictingFile);
    expect(await index.list(signal)).toHaveLength(2);
    await expect(index.resolve(duplicate, signal)).resolves.toMatchObject({
      nativeRef: { nativeSessionId: duplicate },
    });
  });

  it("freshly resolves the selected ID and reports sessions opened by this Adapter as running", async () => {
    const { cwd, environment } = await fixture();
    const native = metadata(cwd);
    const getSessionInfo = vi.fn(async () => native);
    const listSessions = vi.fn(async () => [native]);
    const adapter = new ClaudeCodeAdapter({ environment }, {
      randomUUID: () => "new-session",
      bypassPermissionsAvailable: () => true,
      getSessionInfo,
      listSessions,
      readSessionMessages: async () => [],
    } as unknown as ClaudeAdapterDependencies);

    await expect(adapter.sessionImport.listCandidates()).resolves.toMatchObject({
      ok: true,
      value: [{ nativeSessionId: "claude-native-session", running: null }],
    });
    const opened = await adapter.open({
      kind: "resume",
      cwd,
      nativeRef: {
        harnessId: harnessIdSchema.parse("claude-code"),
        nativeSessionId: "claude-native-session",
        formatVersion: 1,
      },
    });
    expect(opened.ok).toBe(true);
    await expect(adapter.sessionImport.listCandidates()).resolves.toMatchObject({
      ok: true,
      value: [{ nativeSessionId: "claude-native-session", running: true }],
    });
    await expect(
      adapter.sessionImport.resolveCandidate("claude-native-session"),
    ).resolves.toMatchObject({
      ok: true,
      value: { nativeRef: { nativeSessionId: "claude-native-session" } },
    });
    expect(getSessionInfo).toHaveBeenCalledWith({ sessionId: "claude-native-session" });
    if (opened.ok) await opened.value.close();
    await adapter.close();
  });

  it("does not resolve missing or mismatched metadata and honors cancellation", async () => {
    const { cwd, environment } = await fixture();
    const getSessionInfo = vi
      .fn<({ sessionId }: { sessionId: string }) => Promise<ClaudeSessionMetadata | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(metadata(cwd, { sessionId: "another-session" }));
    const index = new ClaudeSessionImportIndex(
      {
        listSessions: async () => [],
        getSessionInfo,
        isRunning: () => false,
        readSessionMessages: async () => [],
      },
      environment,
    );
    const signal = new AbortController().signal;
    await expect(index.resolve("missing", signal)).resolves.toBeNull();
    await expect(index.resolve("requested", signal)).resolves.toBeNull();

    const controller = new AbortController();
    controller.abort();
    await expect(index.list(controller.signal)).rejects.toThrow();
  });

  it("resolves the selected Session to its latest existing Transcript cwd", async () => {
    const { root, cwd, environment } = await fixture();
    const latestCwd = path.join(cwd, "repository");
    await mkdir(latestCwd);
    const readSessionMessages = vi.fn(async () => [
      { type: "user", cwd },
      { type: "assistant", cwd: path.join(root, "missing") },
      { type: "user", cwd: latestCwd },
    ]);
    const index = new ClaudeSessionImportIndex(
      {
        listSessions: async () => [metadata(cwd)],
        getSessionInfo: async () => metadata(cwd),
        isRunning: () => false,
        readSessionMessages,
      },
      environment,
    );

    await expect(index.list(new AbortController().signal)).resolves.toMatchObject([
      { candidate: { cwd } },
    ]);
    await expect(
      index.resolve("claude-native-session", new AbortController().signal),
    ).resolves.toMatchObject({ candidate: { cwd: latestCwd } });
    expect(readSessionMessages).toHaveBeenCalledWith({
      cwd,
      sessionId: "claude-native-session",
    });
  });
});

import { opendir, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { HarnessSessionImportSource } from "@codexhost/harness-adapter";
import { isMissingFileError } from "@codexhost/harness-adapter/session-import";
import {
  HARNESS_SESSION_IMPORT_TITLE_MAX_LENGTH,
  harnessSessionImportCandidateSchema,
  nativeSessionRefSchema,
} from "@codexhost/shared-contracts";

import type { ClaudeSessionMetadata } from "./transport.js";

export interface ClaudeSessionImportDependencies {
  getSessionInfo(input: { sessionId: string }): Promise<ClaudeSessionMetadata | undefined>;
  isRunning(nativeSessionId: string): boolean;
  listSessions(): Promise<readonly ClaudeSessionMetadata[]>;
  readSessionMessages(input: { cwd: string; sessionId: string }): Promise<unknown[] | null>;
}

function claudeProjectsDirectory(environment: NodeJS.ProcessEnv): string {
  const home =
    (process.platform === "win32" ? environment.USERPROFILE : environment.HOME) || os.homedir();
  return path.join(
    path.resolve(environment.CLAUDE_CONFIG_DIR ?? path.join(home, ".claude")),
    "projects",
  );
}

async function openDirectory(directory: string) {
  return opendir(directory).catch((error: unknown) => {
    if (isMissingFileError(error)) return null;
    throw error;
  });
}

async function* sessionFileIds(directory: string, signal: AbortSignal): AsyncGenerator<string> {
  signal.throwIfAborted();
  const projects = await openDirectory(directory);
  if (!projects) return;
  for await (const project of projects) {
    signal.throwIfAborted();
    if (!project.isDirectory()) continue;
    const entries = await openDirectory(path.join(directory, project.name));
    if (!entries) continue;
    for await (const entry of entries) {
      signal.throwIfAborted();
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        yield path.basename(entry.name, ".jsonl");
      }
    }
  }
}

function titleFromMetadata(metadata: ClaudeSessionMetadata): string | null {
  for (const value of [metadata.customTitle, metadata.summary, metadata.firstPrompt]) {
    if (typeof value !== "string") continue;
    const title = value
      .replaceAll("\0", "")
      .trim()
      .slice(0, HARNESS_SESSION_IMPORT_TITLE_MAX_LENGTH);
    if (title) return title;
  }
  return null;
}

async function sourceFromMetadata(
  metadata: ClaudeSessionMetadata,
  isRunning: (nativeSessionId: string) => boolean,
  signal: AbortSignal,
  canonicalCwds: Map<string, Promise<string | null>>,
  preferredCwds: readonly string[] = [],
): Promise<HarnessSessionImportSource | null> {
  signal.throwIfAborted();
  if (
    typeof metadata.sessionId !== "string" ||
    metadata.sessionId.trim().length === 0 ||
    typeof metadata.lastModified !== "number" ||
    !Number.isFinite(metadata.lastModified)
  ) {
    return null;
  }

  const candidates = [
    ...preferredCwds,
    ...(typeof metadata.cwd === "string" ? [metadata.cwd] : []),
  ];
  let cwd: string | null = null;
  for (const candidate of new Set(candidates)) {
    if (!path.isAbsolute(candidate)) continue;
    let canonical = canonicalCwds.get(candidate);
    if (!canonical) {
      canonical = (async () => {
        try {
          const resolved = await realpath(candidate);
          return (await stat(resolved)).isDirectory() ? resolved : null;
        } catch {
          return null;
        }
      })();
      canonicalCwds.set(candidate, canonical);
    }
    cwd = await canonical;
    signal.throwIfAborted();
    if (cwd) break;
  }
  if (!cwd) return null;
  const nativeSessionId = metadata.sessionId.trim();
  const candidate = harnessSessionImportCandidateSchema.safeParse({
    nativeSessionId,
    cwd,
    title: titleFromMetadata(metadata),
    updatedAt: Math.floor(metadata.lastModified),
    // We know about sessions opened through this Adapter. Other Claude clients do not
    // expose a reliable cross-process ownership signal, so their activity stays unknown.
    running: isRunning(nativeSessionId) ? true : null,
  });
  const nativeRef = nativeSessionRefSchema.safeParse({
    harnessId: "claude-code",
    nativeSessionId,
    formatVersion: 1,
  });
  return candidate.success && nativeRef.success
    ? { candidate: candidate.data, nativeRef: nativeRef.data }
    : null;
}

/** Read-only native Claude Session discovery. */
export class ClaudeSessionImportIndex {
  readonly #dependencies: ClaudeSessionImportDependencies;
  readonly #directory: string;
  #listing: Promise<HarnessSessionImportSource[]> | undefined;

  constructor(dependencies: ClaudeSessionImportDependencies, environment: NodeJS.ProcessEnv) {
    this.#dependencies = dependencies;
    this.#directory = claudeProjectsDirectory(environment);
  }

  list(signal: AbortSignal): Promise<HarnessSessionImportSource[]> {
    this.#listing ??= this.#scan(signal).finally(() => {
      this.#listing = undefined;
    });
    return this.#listing;
  }

  async #scan(signal: AbortSignal): Promise<HarnessSessionImportSource[]> {
    signal.throwIfAborted();
    const metadata = await this.#dependencies.listSessions();
    signal.throwIfAborted();
    if (metadata.length === 0) return [];
    const sources: HarnessSessionImportSource[] = [];
    const identities = new Set<string>();
    const ambiguous = new Set<string>();
    for await (const identity of sessionFileIds(this.#directory, signal)) {
      if (identities.has(identity)) ambiguous.add(identity);
      identities.add(identity);
    }
    identities.clear();
    const canonicalCwds = new Map<string, Promise<string | null>>();
    for (const session of metadata) {
      const identity = typeof session.sessionId === "string" ? session.sessionId.trim() : "";
      if (!identity) continue;
      if (identities.has(identity)) ambiguous.add(identity);
      identities.add(identity);
      if (ambiguous.has(identity)) continue;
      const source = await sourceFromMetadata(
        session,
        this.#dependencies.isRunning,
        signal,
        canonicalCwds,
      );
      if (source) sources.push(source);
    }
    return sources
      .filter((source) => !ambiguous.has(source.candidate.nativeSessionId))
      .sort((left, right) => right.candidate.updatedAt - left.candidate.updatedAt);
  }

  async resolve(
    nativeSessionId: string,
    signal: AbortSignal,
  ): Promise<HarnessSessionImportSource | null> {
    signal.throwIfAborted();
    let found = false;
    for await (const identity of sessionFileIds(this.#directory, signal)) {
      if (identity !== nativeSessionId) continue;
      if (found) throw new Error("Claude Code Session identity is ambiguous across files");
      found = true;
    }
    const metadata = await this.#dependencies.getSessionInfo({ sessionId: nativeSessionId });
    signal.throwIfAborted();
    if (!metadata || metadata.sessionId !== nativeSessionId) return null;
    const preferredCwds: string[] = [];
    if (typeof metadata.cwd === "string" && path.isAbsolute(metadata.cwd)) {
      try {
        const messages = await this.#dependencies.readSessionMessages({
          cwd: metadata.cwd,
          sessionId: nativeSessionId,
        });
        signal.throwIfAborted();
        if (messages === null)
          return sourceFromMetadata(
            metadata,
            this.#dependencies.isRunning,
            signal,
            new Map(),
            preferredCwds,
          );
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          const message = messages[index];
          if (
            typeof message !== "object" ||
            message === null ||
            Array.isArray(message) ||
            typeof (message as { cwd?: unknown }).cwd !== "string"
          ) {
            continue;
          }
          const cwd = (message as { cwd: string }).cwd;
          if (path.isAbsolute(cwd) && !preferredCwds.includes(cwd)) preferredCwds.push(cwd);
        }
      } catch {
        // Metadata remains a safe fallback when a native Transcript cannot be read.
      }
    }
    return sourceFromMetadata(
      metadata,
      this.#dependencies.isRunning,
      signal,
      new Map(),
      preferredCwds,
    );
  }
}

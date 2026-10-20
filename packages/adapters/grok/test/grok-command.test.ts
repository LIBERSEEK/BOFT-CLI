import { describe, expect, it } from "vitest";

import { grokInvocation } from "../src/command.js";

describe("Grok invocation", () => {
  it("starts ACP stdio without a Model flag by default", () => {
    expect(grokInvocation("/opt/grok", "darwin")).toMatchObject({
      command: "/opt/grok",
      arguments: ["agent", "--no-leader", "stdio"],
    });
  });

  it.each([
    "grok-4.5",
    "magpie/group/codex-grok",
    "magpie/openrouter/anthropic/claude-sonnet-4:thinking",
    "magpie/relay/Opus 5.5",
    " magpie/relay/Opus 5.5 ",
  ])("passes startup Model %j as one exact native CLI argument", (modelId) => {
    expect(grokInvocation("/opt/grok", "darwin", modelId)).toMatchObject({
      command: "/opt/grok",
      arguments: ["agent", "--no-leader", "--model", modelId, "stdio"],
    });
  });
});

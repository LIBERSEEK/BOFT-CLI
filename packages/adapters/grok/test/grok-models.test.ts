import {
  HARNESS_MODEL_REF_MAX_LENGTH,
  harnessModelCatalogSchema,
  harnessModelRefSchema,
} from "@codexhost/shared-contracts";
import { describe, expect, it } from "vitest";
import {
  decodeGrokModelRef,
  encodeGrokModelRef,
  modelStateFromInitialize,
  modelStateFromSessionResponse,
  parseGrokModelState,
} from "../src/grok-models.js";

describe("Grok Model refs", () => {
  it("keeps existing transport-safe model IDs unchanged", () => {
    expect(encodeGrokModelRef("grok-4.6_fast.v1~test")).toEqual({ id: "grok-4.6_fast.v1~test" });
    expect(decodeGrokModelRef(harnessModelRefSchema.parse({ id: "grok-4.6" }))).toBe("grok-4.6");
  });

  it("round-trips slash IDs without colliding with native IDs that resemble encoded refs", () => {
    const modelId = "magpie/group/codex-grok";
    const ref = encodeGrokModelRef(modelId);
    if (!ref) throw new Error("Missing encoded Model Ref");
    const lookalike = encodeGrokModelRef(ref.id);
    if (!lookalike) throw new Error("Missing escaped Model Ref");
    expect(harnessModelRefSchema.safeParse(ref).success).toBe(true);
    expect(ref.id).not.toContain("/");
    expect(lookalike.id).not.toBe(ref.id);
    expect(decodeGrokModelRef(ref)).toBe(modelId);
    expect(decodeGrokModelRef(lookalike)).toBe(ref.id);
  });

  it.each(["", " ", "grok invalid", "grok\n", "grok\u0000", "a/".repeat(256)])(
    "rejects invalid or unrepresentable native IDs: %j",
    (modelId) => {
      expect(encodeGrokModelRef(modelId)).toBeNull();
      expect(
        parseGrokModelState({
          currentModelId: modelId,
          availableModels: [{ modelId, name: "Invalid" }],
        }),
      ).toBeNull();
    },
  );

  it("preserves the existing Model Ref length limit", () => {
    expect(encodeGrokModelRef("a".repeat(HARNESS_MODEL_REF_MAX_LENGTH))).not.toBeNull();
    expect(encodeGrokModelRef("a".repeat(HARNESS_MODEL_REF_MAX_LENGTH + 1))).toBeNull();
  });

  it.each(["grok-model~", "grok-model~Z3Jvay00LjY", "grok-model~bWFncGllL2dyb3VwL2NvZGV4LWdyb2s."])(
    "rejects noncanonical encoded refs: %s",
    (id) => {
      expect(() => decodeGrokModelRef(harnessModelRefSchema.parse({ id }))).toThrow(
        "Invalid Grok Model Ref",
      );
    },
  );
});

describe("Grok ACP Model catalog", () => {
  const modelId = "magpie/group/codex-grok";
  const models = {
    currentModelId: modelId,
    availableModels: [
      { modelId: "invalid model", name: "Invalid" },
      { modelId: "grok-4.6", name: "Grok 4.6" },
      {
        modelId,
        name: "Codex Grok via Magpie",
        _meta: {
          reasoningEffort: "high",
          reasoningEfforts: [{ id: "high", label: "High" }],
          totalContextTokens: 256000,
          contextWindows: [256000, 500000],
        },
      },
    ],
  };

  it("projects initialize and session catalogs with slash IDs and their metadata", () => {
    const initialized = modelStateFromInitialize({
      protocolVersion: 1,
      _meta: { modelState: models },
    });
    const loaded = modelStateFromSessionResponse({ models });
    if (!initialized) throw new Error("Missing Magpie Model state");
    expect(loaded).toEqual(initialized);
    const state = initialized;
    expect(harnessModelCatalogSchema.safeParse(state.catalog).success).toBe(true);
    expect(state.catalog.models).toHaveLength(2);
    expect(state.catalog.defaultModel).toEqual(state.currentModel);
    expect(decodeGrokModelRef(state.currentModel)).toBe(modelId);
    expect(state.currentThinkingOptionId).toBe("high");
    expect(state.contextWindowTokensByModel.get(state.currentModel.id)).toBe(256000);
    expect(state.defaultContextWindowTokensByModel.get(state.currentModel.id)).toBe(500000);
  });

  it("requires the current model to be advertised", () => {
    expect(parseGrokModelState({ ...models, currentModelId: "magpie/group/missing" })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { upwardScrollTop } from "../../src/settings/selection-scroll.js";

describe("text selection scroll restore", () => {
  it("puts an upward jump back where the selection started", () => {
    expect(upwardScrollTop(240, 0)).toBe(240);
    expect(upwardScrollTop(80, 12)).toBe(80);
  });

  it("keeps a downward scroll that follows the selection", () => {
    expect(upwardScrollTop(80, 140)).toBe(140);
    expect(upwardScrollTop(40, 40)).toBe(40);
  });
});

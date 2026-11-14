import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import boftBrandIconUrl from "../src/assets/codexhost-brand-icon.png";
import { createRendererColoredBrandMark } from "../src/renderer-brand-mark.js";

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  className = "";
  src = "";
  alt = "";
  draggable = true;

  constructor(readonly tagName: string) {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  append(child: FakeElement): void {
    this.children.push(child);
  }
}

describe("settings and console BOFT brand mark", () => {
  for (const size of [24, 28, 32, 34]) {
    it(`renders the BOFT artwork at ${size}px`, () => {
      const createElement = vi.fn((tag: string) => new FakeElement(tag));
      const ownerDocument = { createElement } as unknown as Document;
      const mark = createRendererColoredBrandMark(ownerDocument, size) as unknown as FakeElement;
      expect(mark.tagName).toBe("span");
      expect(mark.className).toBe("codexhost-colored-brand");
      expect(mark.style.width).toBe(`${size}px`);
      expect(mark.style.height).toBe(`${size}px`);
      expect(mark.attributes.get("aria-hidden")).toBe("true");
      expect(mark.attributes.get("data-codexhost-mark")).toBe("boft");
      expect(mark.children).toHaveLength(1);
      const image = mark.children[0];
      expect(image?.tagName).toBe("img");
      expect(image?.className).toBe("codexhost-colored-brand__image");
      expect(image?.src).toBe(boftBrandIconUrl);
      expect(image?.alt).toBe("");
      expect(image?.draggable).toBe(false);
      expect(createElement).toHaveBeenCalledTimes(2);
    });
  }

  it("preserves the artwork without a theme-dependent plate or scaling", () => {
    const brandCss = readFileSync(
      new URL("../src/renderer-brand-mark.css", import.meta.url),
      "utf8",
    );
    expect(brandCss).toContain("object-fit: contain");
    expect(brandCss).not.toMatch(/background|border-radius|transform|prefers-color-scheme/u);
  });
});

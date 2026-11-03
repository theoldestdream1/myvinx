import { afterEach, describe, expect, it, vi } from "vitest";
import { REST, restRect } from "./restingV";
import { OPENER_KEY, shouldShowOpener } from "./VOpener";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("landing V handoff", () => {
  it("lands at the mobile seat using the resolved safe-area offset", () => {
    vi.stubGlobal("innerWidth", 384);
    vi.stubGlobal("innerHeight", 687);
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ bottom: "110px" } as CSSStyleDeclaration);
    const box = restRect();
    expect(box.height).toBe(96);
    expect(box.top).toBe(481);
    expect(box.left + box.width).toBe(370);
  });

  it("keeps the desktop corner unchanged", () => {
    vi.stubGlobal("innerWidth", 1280);
    vi.stubGlobal("innerHeight", 1800);
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ bottom: "14px" } as CSSStyleDeclaration);
    const box = restRect();
    expect(box.height).toBe(128);
    expect(box.top).toBe(1658);
    expect(box.left + box.width).toBe(1280 - REST.margin);
  });
});

describe("preserved Hold to Wake", () => {
  it("still opens for first-time visitors", () => {
    localStorage.clear();
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    expect(shouldShowOpener()).toBe(true);
  });

  it("does not replay after the completed intro is remembered", () => {
    localStorage.setItem(OPENER_KEY, "1");
    expect(shouldShowOpener()).toBe(false);
  });
});
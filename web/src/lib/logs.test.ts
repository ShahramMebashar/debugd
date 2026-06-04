import { describe, it, expect } from "vitest";
import { hasContext } from "./logs";

describe("hasContext", () => {
  it("is false for empty/none", () => {
    expect(hasContext(null)).toBe(false);
    expect(hasContext(undefined)).toBe(false);
    expect(hasContext([])).toBe(false); // empty request()->all()
    expect(hasContext({})).toBe(false);
    expect(hasContext("")).toBe(false);
  });

  it("is true for real data", () => {
    expect(hasContext({ user: 1 })).toBe(true);
    expect(hasContext(["a"])).toBe(true);
    expect(hasContext("hi")).toBe(true);
    expect(hasContext(0)).toBe(true);
  });
});

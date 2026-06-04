import { describe, it, expect } from "vitest";
import { bar } from "./waterfall";

describe("bar", () => {
  it("places a bar by offset and width as percentages of total", () => {
    expect(bar(25, 50, 100)).toEqual({ left: 25, width: 50 });
  });

  it("guarantees a minimum visible width for tiny queries", () => {
    const { width } = bar(0, 0.01, 1000);
    expect(width).toBeGreaterThanOrEqual(0.5);
  });

  it("never overflows past 100%", () => {
    const { left, width } = bar(95, 50, 100);
    expect(left + width).toBeLessThanOrEqual(100);
  });

  it("clamps a zero total to avoid division by zero", () => {
    expect(() => bar(0, 0, 0)).not.toThrow();
    expect(bar(0, 0, 0).left).toBe(0);
  });
});

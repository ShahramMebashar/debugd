import { describe, it, expect } from "vitest";
import { nextMode } from "./theme";

describe("nextMode", () => {
  it("cycles system → light → dark → system", () => {
    expect(nextMode("system")).toBe("light");
    expect(nextMode("light")).toBe("dark");
    expect(nextMode("dark")).toBe("system");
  });
});

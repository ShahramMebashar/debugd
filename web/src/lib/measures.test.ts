import { describe, it, expect } from "vitest";
import { segmentMeasures } from "./measures";
import type { Measure } from "../types";

const m = (label: string, group = "", concurrent = false): Measure => ({
  label, group, concurrent, duration_ms: 1, caller: "x", offset_ms: 0,
});

describe("segmentMeasures", () => {
  it("keeps standalone benches as singleton segments", () => {
    const segs = segmentMeasures([m("a"), m("b")]);
    expect(segs).toHaveLength(2);
    expect(segs.every((s) => s.group === "")).toBe(true);
  });

  it("clusters consecutive spans sharing a group", () => {
    const segs = segmentMeasures([m("bench"), m("t1", "g1"), m("t2", "g1"), m("after")]);
    expect(segs.map((s) => s.items.length)).toEqual([1, 2, 1]);
    expect(segs[1].group).toBe("g1");
  });

  it("does not merge different groups even if adjacent", () => {
    const segs = segmentMeasures([m("a", "g1"), m("b", "g2")]);
    expect(segs).toHaveLength(2);
  });
});

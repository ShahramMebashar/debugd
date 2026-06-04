import { describe, it, expect } from "vitest";
import { mergeSeed } from "./stream";

const key = (n: { id: number }) => n.id;

describe("mergeSeed", () => {
  it("keeps live (newer) items first, then seed items not already present", () => {
    const live = [{ id: 5 }, { id: 4 }];
    const seed = [{ id: 4 }, { id: 3 }, { id: 2 }];
    expect(mergeSeed(live, seed, key, 100).map(key)).toEqual([5, 4, 3, 2]);
  });

  it("does not drop live items that arrived before the seed resolved", () => {
    const live = [{ id: 9 }]; // an SSE event that beat the seed fetch
    const seed = [{ id: 8 }, { id: 7 }];
    expect(mergeSeed(live, seed, key, 100).map(key)).toEqual([9, 8, 7]);
  });

  it("caps the result", () => {
    const live = [{ id: 3 }];
    const seed = [{ id: 2 }, { id: 1 }];
    expect(mergeSeed(live, seed, key, 2).map(key)).toEqual([3, 2]);
  });
});

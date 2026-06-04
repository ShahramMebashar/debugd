import { describe, it, expect } from "vitest";
import { splitHighlight } from "./highlight";

describe("splitHighlight", () => {
  it("returns one plain segment when query is empty", () => {
    expect(splitHighlight("hello world", "")).toEqual([{ text: "hello world", match: false }]);
  });

  it("marks case-insensitive matches and keeps original casing", () => {
    expect(splitHighlight("Boom at BOOM", "boom")).toEqual([
      { text: "Boom", match: true },
      { text: " at ", match: false },
      { text: "BOOM", match: true },
    ]);
  });

  it("handles a match at the start and end", () => {
    expect(splitHighlight("abcabc", "abc")).toEqual([
      { text: "abc", match: true },
      { text: "abc", match: true },
    ]);
  });

  it("reconstructs the original string exactly", () => {
    const s = "select * from users where id = 5";
    expect(splitHighlight(s, "where").map((p) => p.text).join("")).toBe(s);
  });

  it("treats regex-special queries literally", () => {
    expect(splitHighlight("a.b.c", ".")).toEqual([
      { text: "a", match: false },
      { text: ".", match: true },
      { text: "b", match: false },
      { text: ".", match: true },
      { text: "c", match: false },
    ]);
  });
});

import { describe, it, expect } from "vitest";
import { tokenizeSql } from "./sql";

describe("tokenizeSql", () => {
  it("marks SQL keywords case-insensitively", () => {
    const toks = tokenizeSql("SELECT id from users");
    expect(toks).toEqual([
      { value: "SELECT", kind: "keyword" },
      { value: " id ", kind: "text" },
      { value: "from", kind: "keyword" },
      { value: " users", kind: "text" },
    ]);
  });

  it("marks quoted string literals and numbers", () => {
    const toks = tokenizeSql("where name = 'bob' and age = 42");
    expect(toks).toContainEqual({ value: "'bob'", kind: "string" });
    expect(toks).toContainEqual({ value: "42", kind: "number" });
    expect(toks).toContainEqual({ value: "where", kind: "keyword" });
  });

  it("leaves a plain identifier untouched", () => {
    expect(tokenizeSql("users")).toEqual([{ value: "users", kind: "text" }]);
  });

  it("reconstructs the original string exactly", () => {
    const sql = "SELECT * FROM products WHERE id IN (1, 2) AND name = 'x'";
    expect(tokenizeSql(sql).map((t) => t.value).join("")).toBe(sql);
  });
});

import { describe, it, expect } from "vitest";
import { formatSql } from "./sqlFormat";

describe("formatSql", () => {
  it("breaks major clauses onto their own lines", () => {
    const out = formatSql("select * from users where id = ? order by name");
    expect(out).toBe("select *\nfrom users\nwhere id = ?\norder by name");
  });

  it("indents joins and ANDs/ORs under their clause", () => {
    const out = formatSql(
      "select id from a inner join b on a.id = b.a_id where x = ? and y = ?",
    );
    expect(out).toBe(
      "select id\nfrom a\ninner join b on a.id = b.a_id\nwhere x = ?\n  and y = ?",
    );
  });

  it("does not split keywords inside quoted identifiers or strings", () => {
    const out = formatSql(`select * from "order_items" where note = 'from here'`);
    expect(out).toBe(`select *\nfrom "order_items"\nwhere note = 'from here'`);
  });

  it("is case-insensitive on keywords but preserves original casing", () => {
    expect(formatSql("SELECT a FROM t")).toBe("SELECT a\nFROM t");
  });

  it("collapses incidental whitespace", () => {
    expect(formatSql("select   a   from   t")).toBe("select a\nfrom t");
  });
});

import { describe, it, expect } from "vitest";
import { filterTraces, type TraceFilter } from "./filters";
import type { Summary } from "../types";

const t = (over: Partial<Summary>): Summary => ({
  trace_id: "x", app: "a", method: "GET", path: "/", status: 200,
  duration_ms: 1, memory_mb: 0, query_count: 0, n_plus_one: 0, started_at: "", ...over,
});

const base: TraceFilter = { path: "", status: "", nPlusOneOnly: false };

describe("filterTraces", () => {
  const traces = [
    t({ trace_id: "1", path: "/api/orders", status: 200, n_plus_one: 2 }),
    t({ trace_id: "2", path: "/api/users", status: 404, n_plus_one: 0 }),
    t({ trace_id: "3", path: "/health", status: 500, n_plus_one: 0 }),
  ];

  it("returns all when filter is empty", () => {
    expect(filterTraces(traces, base)).toHaveLength(3);
  });

  it("matches path case-insensitively as a substring", () => {
    expect(filterTraces(traces, { ...base, path: "API" }).map((x) => x.trace_id))
      .toEqual(["1", "2"]);
  });

  it("filters by status class (first digit)", () => {
    expect(filterTraces(traces, { ...base, status: "5" }).map((x) => x.trace_id))
      .toEqual(["3"]);
  });

  it("shows only N+1 traces when nPlusOneOnly is set", () => {
    expect(filterTraces(traces, { ...base, nPlusOneOnly: true }).map((x) => x.trace_id))
      .toEqual(["1"]);
  });

  it("combines predicates (AND)", () => {
    expect(filterTraces(traces, { ...base, path: "api", status: "4" }).map((x) => x.trace_id))
      .toEqual(["2"]);
  });
});

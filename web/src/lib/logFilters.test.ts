import { describe, it, expect } from "vitest";
import { filterLogs, type LogFilter } from "./logFilters";
import type { LogLine } from "../types";

const line = (over: Partial<LogLine>): LogLine => ({
  id: 1, time: "", channel: "local", level: "INFO", message: "", detail: "", source: "laravel.log", ...over,
});

const base: LogFilter = { text: "", level: "", channel: "", source: "" };

describe("filterLogs", () => {
  const lines = [
    line({ id: 1, level: "INFO", channel: "local", message: "home rendered", source: "laravel.log" }),
    line({ id: 2, level: "ERROR", channel: "local", message: "boom", detail: "#0 SqlException", source: "laravel.log" }),
    line({ id: 3, level: "INFO", channel: "queue", message: "job done", source: "messaging.log" }),
  ];

  it("returns all when empty", () => {
    expect(filterLogs(lines, base)).toHaveLength(3);
  });

  it("matches text in message or detail, case-insensitively", () => {
    expect(filterLogs(lines, { ...base, text: "BOOM" }).map((l) => l.id)).toEqual([2]);
    expect(filterLogs(lines, { ...base, text: "sqlexception" }).map((l) => l.id)).toEqual([2]);
  });

  it("filters by level (case-insensitive)", () => {
    expect(filterLogs(lines, { ...base, level: "error" }).map((l) => l.id)).toEqual([2]);
  });

  it("filters by channel", () => {
    expect(filterLogs(lines, { ...base, channel: "queue" }).map((l) => l.id)).toEqual([3]);
  });

  it("filters by source file", () => {
    expect(filterLogs(lines, { ...base, source: "messaging.log" }).map((l) => l.id)).toEqual([3]);
  });

  it("combines predicates", () => {
    expect(filterLogs(lines, { ...base, level: "info", channel: "local" }).map((l) => l.id)).toEqual([1]);
  });
});

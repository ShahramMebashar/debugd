// Mirrors internal/trace/types.go. Keep in sync with the wire protocol (v1).

export interface Summary {
  trace_id: string;
  app: string;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  memory_mb: number;
  query_count: number;
  n_plus_one: number;
  started_at: string;
}

export interface Query {
  sql: string;
  bindings_count: number;
  duration_ms: number;
  connection: string;
  caller: string;
  offset_ms: number;
}

export interface LogEntry {
  level: string;
  message: string;
  context: Record<string, unknown>;
  offset_ms: number;
}

export interface Suggestion {
  table: string;
  column: string;
  kind: string; // belongs_to | has_many | morph | unknown
  relation: string;
  fix: string;
}

export interface NPlusOne {
  normalized_sql: string;
  caller: string;
  count: number;
  total_ms: number;
  indices: number[]; // positions in queries[] that belong to this group
  suggestion: Suggestion;
}

export interface Envelope {
  v: number;
  trace_id: string;
  app: string;
  request: {
    method: string;
    path: string;
    route: string;
    status: number;
    duration_ms: number;
    boot_ms: number;
    memory_mb: number;
    started_at: string;
  };
  queries: Query[];
  logs: LogEntry[];
  exception: { class: string; message: string; file: string; trace: string } | null;
  n_plus_one?: NPlusOne[];
}

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
  context: unknown; // arbitrary user data — object, array, or scalar
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

export interface Meta {
  logs: boolean;
  logs_path: string;
  version: string;
  addr: string;
  buffer: number;
  n_plus_one: number;
}

export interface LogLine {
  id: number;
  time: string;
  channel: string;
  level: string;
  message: string;
  detail: string;
  source: string;
}

export interface Octane {
  running: boolean;
  worker_pid: number;
  worker_requests: number;
  worker_memory_start_mb: number;
  memory_growth_mb: number;
  bindings: number;
  new_bindings: string[];
}

export interface Dump {
  label: string | null;
  type: string;
  value: string;
  caller: string;
  offset_ms: number;
}

export interface Measure {
  label: string;
  duration_ms: number;
  caller: string;
  offset_ms: number;
  concurrent: boolean; // ran in parallel (Octane) vs sequentially
  group: string; // batch id; same for one concurrently() call, "" for bench()
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
  dumps?: Dump[];
  measures?: Measure[];
  octane?: Octane | null;
  exception: { class: string; message: string; file: string; trace: string } | null;
  n_plus_one?: NPlusOne[];
}

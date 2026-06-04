// Package trace defines the wire protocol v1 — the single frozen contract
// shared by the Laravel collector and every Go server package. Change here
// = breaking change; bump V and update PROTOCOL.md + schema/trace.schema.json.
package trace

// ProtocolVersion is the only version this server accepts.
const ProtocolVersion = 1

// Envelope is one request's full trace (one JSON object per HTTP request).
type Envelope struct {
	V         int        `json:"v"`
	TraceID   string     `json:"trace_id"`
	App       string     `json:"app"`
	Request   Request    `json:"request"`
	Queries   []Query    `json:"queries"`
	Logs      []Log      `json:"logs"`
	Dumps     []Dump     `json:"dumps"`
	Measures  []Measure  `json:"measures"`
	Exception *Exception `json:"exception"`
	Octane    *Octane    `json:"octane"`

	// NPlusOne is server-derived (not sent by the client), filled by analyze.
	NPlusOne []NPlusOne `json:"n_plus_one,omitempty"`
}

type Request struct {
	Method     string  `json:"method"`
	Path       string  `json:"path"`
	Route      string  `json:"route"`
	Status     int     `json:"status"`
	DurationMs float64 `json:"duration_ms"` // total: request start → response sent
	BootMs     float64 `json:"boot_ms"`     // framework boot cost
	MemoryMB   float64 `json:"memory_mb"`   // peak memory (real allocation)
	StartedAt  string  `json:"started_at"`
}

type Query struct {
	SQL           string  `json:"sql"`
	BindingsCount int     `json:"bindings_count"`
	DurationMs    float64 `json:"duration_ms"`
	Connection    string  `json:"connection"`
	Caller        string  `json:"caller"`
	OffsetMs      float64 `json:"offset_ms"`
}

type Log struct {
	Level    string         `json:"level"`
	Message  string         `json:"message"`
	Context  map[string]any `json:"context"`
	OffsetMs float64        `json:"offset_ms"`
}

// Octane carries worker-level signals (Octane only; ~inert under php-fpm).
type Octane struct {
	Running             bool     `json:"running"`
	WorkerPID           int      `json:"worker_pid"`
	WorkerRequests      int      `json:"worker_requests"`
	WorkerMemoryStartMB float64  `json:"worker_memory_start_mb"`
	MemoryGrowthMB      float64  `json:"memory_growth_mb"`
	Bindings            int      `json:"bindings"`
	NewBindings         []string `json:"new_bindings"`
}

// Dump is a value recorded via the debugd() helper.
type Dump struct {
	Label    string  `json:"label"`
	Type     string  `json:"type"`
	Value    string  `json:"value"`
	Caller   string  `json:"caller"`
	OffsetMs float64 `json:"offset_ms"`
}

// Measure is a benchmarked block (debugd()->bench()) or a task from a
// concurrently() batch. Spans in the same batch share Group; Concurrent is true
// when they actually ran in parallel (under Octane).
type Measure struct {
	Label      string  `json:"label"`
	DurationMs float64 `json:"duration_ms"`
	Caller     string  `json:"caller"`
	OffsetMs   float64 `json:"offset_ms"`
	Concurrent bool    `json:"concurrent"`
	Group      string  `json:"group"`
}

type Exception struct {
	Class   string `json:"class"`
	Message string `json:"message"`
	File    string `json:"file"` // file:line
	Trace   string `json:"trace"`
}

// NPlusOne is a flagged group of repeated, identically-shaped queries.
// Indices are the positions in Envelope.Queries that belong to this group, so
// the UI can mark exactly those rows (not every query sharing the caller).
type NPlusOne struct {
	NormalizedSQL string     `json:"normalized_sql"`
	Caller        string     `json:"caller"`
	Count         int        `json:"count"`
	TotalMs       float64    `json:"total_ms"`
	Indices       []int      `json:"indices"`
	Suggestion    Suggestion `json:"suggestion"`
}

// Suggestion is a heuristic, actionable fix for an N+1 group, inferred from the
// query shape and call site. Relation may be empty when it can't be guessed.
type Suggestion struct {
	Table    string `json:"table"`
	Column   string `json:"column"`
	Kind     string `json:"kind"` // belongs_to | has_many | morph | unknown
	Relation string `json:"relation"`
	Fix      string `json:"fix"`
}

// Summary is the lightweight projection broadcast over SSE and listed at
// GET /api/traces — keeps fan-out payloads small; full trace fetched by ID.
type Summary struct {
	TraceID    string  `json:"trace_id"`
	App        string  `json:"app"`
	Method     string  `json:"method"`
	Path       string  `json:"path"`
	Status     int     `json:"status"`
	DurationMs float64 `json:"duration_ms"`
	MemoryMB   float64 `json:"memory_mb"`
	QueryCount int     `json:"query_count"`
	NPlusOne   int     `json:"n_plus_one"` // number of flagged groups
	StartedAt  string  `json:"started_at"`
}

// Summarize projects an analyzed Envelope into its list/SSE form.
func (e *Envelope) Summarize() Summary {
	return Summary{
		TraceID:    e.TraceID,
		App:        e.App,
		Method:     e.Request.Method,
		Path:       e.Request.Path,
		Status:     e.Request.Status,
		DurationMs: e.Request.DurationMs,
		MemoryMB:   e.Request.MemoryMB,
		QueryCount: len(e.Queries),
		NPlusOne:   len(e.NPlusOne),
		StartedAt:  e.Request.StartedAt,
	}
}

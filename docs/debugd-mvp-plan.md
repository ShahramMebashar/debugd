# debugd — MVP Architecture & Implementation Plan

Zero-instrumentation request tracing for Laravel APIs. Single Go binary server, passive Laravel collector, real-time trace UI with N+1 detection.

---

## 1. Toolchain (June 2026)

| Layer | Choice | Version |
|---|---|---|
| Server | Go (stdlib `net/http`, no framework) | 1.26.x |
| Laravel package | PHP / Laravel | PHP ^8.2, Laravel ^11\|^12\|^13 |
| UI | React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui | latest |
| UI ↔ server | SSE (`text/event-stream`) | — |
| Transport (app → server) | HTTP POST, NDJSON body | — |
| Persistence (MVP) | In-memory ring buffer (last 500 traces) | — |
| Tests | Pest (PHP), `go test` + `httptest` (Go), Vitest (UI) | latest |
| CI / release | GitHub Actions + GoReleaser (linux/darwin/windows, amd64/arm64) | latest |

Decisions locked: no Docker requirement, no desktop app, no SQLite in MVP, no config files (env/flags only).

---

## 2. Architecture

```
Laravel app                         Go binary (debugd)              Browser
┌──────────────────────┐  POST     ┌──────────────────────┐  SSE   ┌─────────────┐
│ TraceMiddleware      │ /ingest   │ /ingest handler      │──────▶│ React UI    │
│  └ trace_id (UUIDv7) │──────────▶│  └ validate v=1      │       │ request list│
│ Collector (per req)  │ NDJSON    │  └ N+1 analyzer      │       │ trace view  │
│  ├ DB::listen        │ on        │  └ ring buffer (500) │       └─────────────┘
│  ├ Monolog handler   │ terminate │  └ broadcast hub     │
│  └ exception hook    │           │ / serves embed.FS UI │
└──────────────────────┘           └──────────────────────┘
```

**Repos:** `debugd` (Go server + UI, monorepo) and `debugd-laravel` (composer package).

### 2.1 Laravel package (`debugd-laravel`)

- **Service provider** (auto-discovered). Boots only when `DEBUGD_HOST` is set; otherwise zero overhead — no listeners registered.
- **TraceMiddleware** (terminable, prepended globally): assigns UUIDv7 trace ID, captures method/route/status/duration; in `terminate()` serializes the collector and POSTs to the server.
- **Collector** (scoped singleton — Octane-safe, fresh per request): plain array buffer. Receives from:
  - `DB::listen` — sql, bindings_count, duration, connection, caller (first non-vendor frame via `debug_backtrace(IGNORE_ARGS, 12)`), offset_ms
  - Custom Monolog handler appended to the stack — level, message, context, offset_ms
  - `report()` hook via `Exceptions::report` — class, message, file:line, trimmed trace
- **Transport:** Guzzle POST, `timeout=0.1`, `connect_timeout=0.05`, fully wrapped in try/catch. Runs after the response is sent — zero user-facing latency, failures silent.
- **Safety defaults:** bindings never shipped (count only); `DEBUGD_CAPTURE_BINDINGS=true` opt-in; payload capped at 512 KB (drop oldest log entries first).

### 2.2 Wire protocol (v1)

One JSON object per request:

```json
{
  "v": 1,
  "trace_id": "0196f3a2-...",
  "app": "froshly",
  "request": {"method":"POST","path":"/api/orders","route":"orders.store","status":201,"duration_ms":142.3,"started_at":"..."},
  "queries": [{"sql":"select * from products where id = ?","bindings_count":1,"duration_ms":1.2,"connection":"pgsql","caller":"app/Services/OrderService.php:48","offset_ms":12.5}],
  "logs": [{"level":"info","message":"order created","context":{},"offset_ms":98.1}],
  "exception": null
}
```

Server ignores unknown fields; `v` gates breaking changes. This contract is frozen first (task 0) — both sides build against it.

### 2.3 Go server (`debugd`)

- `cmd/debugd/main.go` — flags: `--addr :9100`, `--buffer 500`, `--open`
- `internal/ingest` — POST handler: decode, validate `v`, run analyzer, store, broadcast
- `internal/analyze` — SQL normalizer (literals→`?`, collapse `IN` lists, lowercase, collapse whitespace) + N+1 grouper: key = `normalized_sql|caller`, flag groups with count ≥ 3, attach total wasted ms and offending file:line
- `internal/store` — mutex-guarded ring buffer; trace lookup by ID
- `internal/sse` — hub: register/unregister channels, fan-out new trace summaries; full trace fetched via `GET /api/traces/{id}` on click (keeps SSE payloads small)
- `web/` — Vite build embedded via `embed.FS`, served at `/`
- Single binary, no CGO, `-ldflags "-s -w"` → ~8–12 MB

### 2.4 UI

- **Request list** (left / top on mobile): live via SSE — method, path, status, duration, query count, red N+1 badge. Filter by path/status/N+1-only.
- **Trace view**: query waterfall (offset_ms bars), N+1 groups collapsed with count + caller + total ms, logs interleaved by offset, exception panel.
- State: plain React state + one SSE hook. No state library needed at this size.

---

## 3. Implementation plan — 4 milestones

### M0 — Contract & skeleton (1–2 days)
- [ ] Freeze wire protocol v1 as `PROTOCOL.md` + JSON Schema in `debugd` repo
- [ ] Scaffold both repos, CI (lint + test on push), GoReleaser config
- [ ] Go: HTTP server skeleton with `/ingest` accepting + logging payloads, `/healthz`

### M1 — Capture path (3–4 days)
- [ ] Service provider + env-gated boot, scoped Collector singleton
- [ ] TraceMiddleware with UUIDv7 + terminate() flush (Guzzle, timeouts, silent failure)
- [ ] DB::listen capture incl. caller resolution (skip vendor frames)
- [ ] Monolog handler + exception hook
- [ ] Payload cap + bindings opt-in
- [ ] Pest tests: feature test asserting full payload shape against the JSON Schema; Octane test (two sequential requests, no state bleed)
- **Exit criteria:** hit a Froshly endpoint, see valid JSON logged by the Go skeleton

### M2 — Server core (3–4 days)
- [ ] Ring buffer store + `GET /api/traces`, `GET /api/traces/{id}`
- [ ] SQL normalizer + N+1 analyzer
- [ ] SSE hub + `GET /events`
- [ ] Table-driven Go tests: normalizer cases (numerics, strings, IN lists, pgsql `$1` placeholders), N+1 threshold edges, ring buffer wraparound, concurrent ingest (`-race`)
- **Exit criteria:** `curl` replay of recorded payloads → correct N+1 flags, SSE events visible via `curl -N`

### M3 — UI + release (4–5 days)
- [ ] Vite + React 19 + Tailwind v4 + shadcn/ui scaffold inside `web/`
- [ ] SSE hook, request list with filters, N+1 badge
- [ ] Trace detail: waterfall, N+1 groups, logs, exception
- [ ] `embed.FS` integration + `--open` flag
- [ ] GoReleaser: tagged release with 6 prebuilt binaries + checksums + `install.sh`
- [ ] README: 2-step install (`curl | sh` the binary, `composer require --dev`), GIF demo
- **Exit criteria:** fresh machine → running with both commands in under 2 minutes

**Total: ~2–3 weeks part-time.** Dogfood on Froshly throughout M1–M3.

---

## 4. Correctness checklist (non-negotiables)

- Collector resets per request (Octane/FrankenPHP) — tested, not assumed
- Flush never throws, never blocks > 150 ms worst case, only in `terminate()`
- Package fully inert when `DEBUGD_HOST` unset (assert zero listeners registered)
- N+1 keyed on `normalized_sql + caller` to avoid false positives across code paths
- Go server safe under concurrent ingest + SSE (run CI with `-race`)
- Protocol versioned; server tolerant of unknown fields
- No PII by default (no bindings, no headers, no request body in MVP)

## 5. Explicitly out of scope (v0.2+)

Jobs/cache/mail capture, SQLite persistence, request replay, Go/Fiber client SDK, sampling mode for staging, `with()` fix suggestions, Tauri wrapper.

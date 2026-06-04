# AGENTS.md

Operating manual for agents working on **debugd** — zero-instrumentation request
tracing for Laravel. Read this before touching code. Keep it short and current.

## What this is

A single Go binary that ingests request traces from a passive Laravel package,
detects N+1 queries, and streams them to a React UI over SSE. No DB, no Docker,
no config files. The product is "two commands and you're tracing in 2 minutes."

```
Laravel (debugd-laravel)  ──POST /ingest (NDJSON)──▶  Go (debugd)  ──SSE /events──▶  React UI
   collector, terminate()                              analyze → store → broadcast
```

## Layout

| Path | Responsibility (one each — SRP) |
|---|---|
| `internal/trace` | Wire types. The shared contract. Everything depends on it. |
| `internal/ingest` | HTTP edge: decode → validate `v` → analyze → store → broadcast. |
| `internal/analyze` | Pure N+1 detection. SQL normalize + group. No I/O, no state. |
| `internal/store` | Mutex-guarded ring buffer (last N traces). Lookup by ID. |
| `internal/sse` | Fan-out hub. Buffered per-client channels, drops on slow client. |
| `cmd/debugd` | Wiring + routes + embedded UI. |
| `web/` | Vite/React UI, built to `web/dist`, embedded via `web/embed.go`. |
| `debugd-laravel/` | Composer package (separate repo). Collector + middleware + transport. |

## Non-negotiables (correctness — never regress these)

1. **`v == 1` or reject.** Server tolerates *unknown* fields, never a wrong version.
2. **Tracing never affects the app.** `Sender` swallows every error; flush only in
   `terminate()`; Guzzle `timeout=0.1`, `connect_timeout=0.05`.
3. **Inert when `DEBUGD_HOST` unset.** No listeners, no middleware, zero overhead.
4. **Collector is request-scoped.** Octane/FrankenPHP-safe — fresh per request, no bleed.
5. **N+1 key = `normalized_sql + caller`.** Never conflate code paths.
6. **Concurrency-safe server.** Always test with `-race`.
7. **No PII by default.** Bindings = count only (opt-in raw), no headers, no body.

## Rules of engagement

- **KISS first.** In-memory ring buffer, plain React state, stdlib `net/http`, regex
  normalizer. Don't add a framework, store library, or DB. If a change needs one,
  it's probably out of scope (see plan §5).
- **Contract is frozen.** Changing `internal/trace` types = a protocol change: bump
  `ProtocolVersion`, update `PROTOCOL.md` + `schema/trace.schema.json` + `web/src/types.ts`
  in the same change. These four move together — always.
- **Keep `analyze` pure.** No I/O, no globals. It's the most-tested package; keep it
  table-test-friendly.
- **Match the surrounding code.** Go: small packages, return errors, no panics on the
  request path. PHP: `declare(strict_types=1)`, `final` classes, constructor injection.
  TS: `strict`, no `any`, mirror Go field names.
- **TDD for logic.** `analyze` and `Collector` changes start with a failing test.

## Best tools / commands

```bash
make run        # go run with --open (UI must be built once: make ui)
make test       # go test -race ./...  +  vitest
make build      # vite build → embed → single binary at bin/debugd
go test -race ./internal/analyze   # the hot path while iterating on detection
cd web && npm run dev               # UI dev server, proxies /api + /events to :9100
cd debugd-laravel && vendor/bin/pest
```

| Need | Use |
|---|---|
| Go HTTP | stdlib `net/http` + `ServeMux` method patterns (`GET /api/traces/{id}`) |
| UI styling | Tailwind v4 (`@import "tailwindcss"`) + shadcn/ui components |
| UUIDs | `symfony/uid` `UuidV7` (time-ordered) |
| HTTP client (PHP) | Guzzle, tight timeouts, `http_errors=false` |
| Release | GoReleaser (`.goreleaser.yaml`), 6 binaries + checksums |

## Status

M0–M3 implemented and tested. Go: ingest/analyze/store/sse + embedded UI, `go test
-race ./...` green. Laravel: capture path, Pest green. UI: live list with filters,
trace detail (waterfall, N+1, logs, exception) built with shadcn/ui (Base UI +
Tailwind v4, `@/` alias, components in `src/components/ui/`), Vitest green.
`install.sh` + GoReleaser config in place. Remaining for a tagged release: cut a
GitHub release, record the README demo GIF.

## Definition of done

`make test` green (incl. `-race`), `npm run lint` clean, Pest green, and the four
contract files in sync if types changed. Dogfood against Froshly before shipping.

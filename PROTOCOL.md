# Wire Protocol v1

The **frozen contract** between `debugd-laravel` (producer) and `debugd` (consumer).
One JSON object per HTTP request, POSTed to `/ingest` as NDJSON (one object per line).

- `v` gates breaking changes. The server rejects any `v != 1`.
- The server **ignores unknown fields** — additive changes don't need a bump.
- Machine-readable form: [`schema/trace.schema.json`](schema/trace.schema.json).

## Example

```json
{
  "v": 1,
  "trace_id": "0196f3a2-1d4b-7c00-8f1a-2b3c4d5e6f70",
  "app": "froshly",
  "request": {
    "method": "POST", "path": "/api/orders", "route": "orders.store",
    "status": 201, "duration_ms": 142.3, "boot_ms": 18.4, "memory_mb": 12.0,
    "started_at": "2026-06-04T10:00:00Z"
  },
  "queries": [
    {"sql": "select * from products where id = ?", "bindings_count": 1,
     "duration_ms": 1.2, "connection": "pgsql",
     "caller": "app/Services/OrderService.php:48", "offset_ms": 12.5}
  ],
  "logs": [
    {"level": "info", "message": "order created", "context": {}, "offset_ms": 98.1}
  ],
  "exception": null
}
```

## Field notes

| Field | Notes |
|---|---|
| `trace_id` | UUIDv7 — time-ordered, assigned by the middleware. |
| `queries[].bindings_count` | Count only by default. Raw bindings shipped only with `DEBUGD_CAPTURE_BINDINGS=true`. |
| `queries[].caller` | First non-vendor stack frame, `relative/path.php:line`. N+1 grouping key with `sql`. |
| `*.offset_ms` | Milliseconds since request start — drives the UI waterfall. |
| `exception` | `null` when none. |
| `n_plus_one` | **Server-derived**, never sent by the client. |

## Server-side derivation

The server normalizes each `sql`, groups by `normalized_sql + caller`, and flags
groups whose `count` reaches the N+1 threshold (default 2, set via `--n-plus-one`
or `DEBUGD_NPLUSONE`). See `internal/analyze`.

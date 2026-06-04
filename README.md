# debugd

A tiny request profiler for Laravel that you actually leave running. One Go binary
serves a live UI; a `--dev` Composer package quietly ships each request's queries,
logs, timings, and exceptions to it. No Docker, no database, no config files — and
when you don't set `DEBUGD_HOST`, the package does literally nothing.

```
your Laravel app  ──POST /ingest──▶  debugd (one binary)  ──live UI──▶  your browser
```

## What you see

- **Every request, live** — method, path, status, total time, query count. Click one to dig in.
- **Queries** with the SQL, how long each took, where it was fired from, and a waterfall so you can spot the slow stretch.
- **N+1 detection that tells you the fix** — it spots repeated query shapes from the same caller and suggests the actual `->with('…')` to add, including the relation name when it can guess it.
- **Request cost** — total duration, framework boot time, and peak memory.
- **Your own dumps and benchmarks** via a global `debugd()` helper (below).
- **Octane stats** — worker PID, requests served, and a heads-up when memory keeps climbing on a worker (the classic leak).
- Logs, exceptions with trace, dark/light theme. It's meant to be looked at all day.

## Get it running

**The server** (a single ~6 MB binary, UI baked in):

```bash
make build          # → bin/debugd   (or grab a release once one's cut)
./bin/debugd --open # listens on :9100 and opens the UI
```

**Your app:**

```bash
composer require --dev debugd/debugd-laravel
echo "DEBUGD_HOST=http://localhost:9100" >> .env
```

Hit any page that does some work — it shows up instantly. Remove `DEBUGD_HOST` and the
package is inert again (no listeners, zero overhead).

> Not on Packagist yet? Point Composer at a local checkout:
> ```bash
> composer config repositories.debugd path ../debugd/debugd-laravel
> composer require --dev debugd/debugd-laravel:@dev
> ```

## The `debugd()` helper

Leave these in your code — they're a no-op in production (when `DEBUGD_HOST` is unset),
and `bench()` still returns its result either way.

```php
debugd($user);                                  // dump anything into the trace
debugd()->dump($payload, 'stripe response');    // ...with a label
$rows = debugd()->bench('report', fn () => Report::heavy());  // time it, get the result
debugd()->info('reached checkout', ['step' => 3]);

// run things in parallel (real parallelism under Octane, sequential otherwise),
// and see each as a span:
[$user, $orders] = array_values(debugd()->concurrently([
    'user'   => fn () => User::find($id),
    'orders' => fn () => Order::recent($id),
]));
```

## Knobs

Flags on the binary (or the matching env var):

| Flag | Default | What |
|---|---|---|
| `--addr` | `:9100` | where the server listens (`DEBUGD_ADDR`) |
| `--n-plus-one` | `2` | how many repeats before it's an N+1 (`DEBUGD_NPLUSONE`) |
| `--buffer` | `500` | how many recent traces to keep in memory |
| `--open` | off | open the browser on start |

On the app side, `DEBUGD_CAPTURE_BINDINGS=true` ships raw query bindings (off by default —
no values leave your app otherwise).

## How it works

The package hangs off `DB::listen`, a Monolog handler, and the exception reporter, buffers
everything per-request, and POSTs it from `terminate()` *after* the response is already sent
— with tight timeouts and every failure swallowed, so tracing can't slow down or break a
request. The server normalizes SQL, flags N+1s, keeps the last few hundred traces in a ring
buffer, and streams them to the browser over SSE. It's Octane- and FrankenPHP-safe (state is
per-request, tested).

## Not doing (on purpose)

No persistence — restart and the traces are gone. No production telemetry, sampling, or
auth. It's a local dev tool: two commands, look at it, close it. The frozen wire format lives
in [`PROTOCOL.md`](PROTOCOL.md); architecture and conventions in [`AGENTS.md`](AGENTS.md).

MIT.

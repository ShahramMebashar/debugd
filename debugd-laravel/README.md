# debugd for Laravel

[![Packagist Version](https://img.shields.io/packagist/v/debugd/debugd-laravel)](https://packagist.org/packages/debugd/debugd-laravel)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Zero-instrumentation request tracing for Laravel — the passive collector for the
[**debugd**](https://github.com/ShahramMebashar/debugd) server.

<p align="center">
  <img src="https://raw.githubusercontent.com/ShahramMebashar/debugd/main/app-screenshot.jpg" alt="debugd live UI" width="100%">
</p>

It quietly ships each request's queries, logs, timings, exceptions, and your own dumps to a
local debugd server, which serves a live UI. When `DEBUGD_HOST` is unset, the package does
**literally nothing** — no listeners, zero overhead — so it's safe to leave installed.

```
your Laravel app  ──POST /ingest──▶  debugd (one Go binary)  ──live UI──▶  your browser
```

> This is the read-only split of [`ShahramMebashar/debugd`](https://github.com/ShahramMebashar/debugd) (the `debugd-laravel/` directory). Open issues and PRs there.

## Requirements

- PHP `^8.2`
- Laravel 11, 12, or 13 (`illuminate/support` `^11 || ^12 || ^13`)

## Install

```bash
composer require --dev debugd/debugd-laravel
echo "DEBUGD_HOST=http://localhost:9100" >> .env
```

Start the [debugd server](https://github.com/ShahramMebashar/debugd) (`./bin/debugd --open`),
hit any page that does some work, and the trace shows up instantly. Remove `DEBUGD_HOST` and
the package goes inert again.

The service provider is auto-discovered — no manual registration needed.

## The `debugd()` helper

Leave these in your code. They're a no-op in production (when `DEBUGD_HOST` is unset), and
`bench()` still returns its result either way.

```php
debugd($user);                                  // dump anything into the trace
debugd()->dump($payload, 'stripe response');    // ...with a label
$rows = debugd()->bench('report', fn () => Report::heavy());  // time it, get the result
debugd()->info('reached checkout', ['step' => 3]);

// run things in parallel (real parallelism under Octane, sequential otherwise),
// each shown as its own span:
[$user, $orders] = array_values(debugd()->concurrently([
    'user'   => fn () => User::find($id),
    'orders' => fn () => Order::recent($id),
]));
```

## Configuration

| Env var | Default | What |
|---|---|---|
| `DEBUGD_HOST` | _(unset)_ | debugd server URL. Unset = package fully disabled. |
| `DEBUGD_CAPTURE_BINDINGS` | `false` | Ship raw query bindings. Off by default — no values leave your app otherwise. |

## How it works

The package hangs off `DB::listen`, a Monolog handler, and the exception reporter, buffers
everything per-request, and POSTs it from `terminate()` *after* the response is already sent —
with tight timeouts and every failure swallowed, so tracing can't slow down or break a
request. It's Octane- and FrankenPHP-safe (state is per-request, tested).

## Not doing (on purpose)

No persistence, no production telemetry, no sampling, no auth. It's a local dev tool. The
frozen wire format lives in [`PROTOCOL.md`](https://github.com/ShahramMebashar/debugd/blob/main/PROTOCOL.md).

## License

MIT.

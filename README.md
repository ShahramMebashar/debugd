# debugd

Zero-instrumentation request tracing for Laravel APIs. One Go binary, a passive
Laravel collector, a live trace UI with N+1 detection. No Docker, no DB, no config.

```
Laravel app  ──POST /ingest──▶  debugd (Go binary)  ──SSE──▶  Browser UI
```

## Install (target: under 2 minutes)

```bash
# 1. The server (single binary)
curl -fsSL https://debugd.dev/install.sh | sh
debugd --open                       # listens on :9100, opens the UI

# 2. The collector (in your Laravel app)
composer require --dev debugd/debugd-laravel
echo "DEBUGD_HOST=http://localhost:9100" >> .env
```

Hit any endpoint → the trace appears live. Unset `DEBUGD_HOST` → the package is
completely inert.

## Develop

```bash
make run     # build UI once with `make ui`, then run the server with --open
make test    # go test -race + vitest
make build   # → bin/debugd (UI embedded)
```

See [`AGENTS.md`](AGENTS.md) for architecture, rules, and conventions, and
[`PROTOCOL.md`](PROTOCOL.md) for the frozen wire contract.

## Status

Scaffold per [`docs/debugd-mvp-plan.md`](docs/debugd-mvp-plan.md). Milestones:
M0 contract & skeleton · M1 capture path · M2 server core · M3 UI + release.

## License

MIT

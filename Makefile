.PHONY: build ui run test test-go test-ui clean desktop desktop-dev sidecar

# Build the UI first, then embed it into the single Go binary.
build: ui
	go build -ldflags "-s -w" -o bin/debugd ./cmd/debugd

ui:
	cd web && npm ci && npm run build

run:
	go run ./cmd/debugd --open

# --- Desktop (Tauri) ---------------------------------------------------------
# The Go binary embeds web/dist, and Tauri bundles the Go binary, so the order is:
# build UI -> build sidecar (embeds UI) -> tauri build (bundles sidecar).
sidecar: ui
	./scripts/build-sidecar.sh

desktop: sidecar
	cd web && npm run tauri:build

# Dev shell with HMR. Run the Go server separately: `go run ./cmd/debugd`.
desktop-dev:
	cd web && npm run tauri:dev

test: test-go test-ui

test-go:
	go test -race ./...

test-ui:
	cd web && npm test

clean:
	rm -rf bin web/dist/assets

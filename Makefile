.PHONY: build ui run test test-go test-ui clean

# Build the UI first, then embed it into the single Go binary.
build: ui
	go build -ldflags "-s -w" -o bin/debugd ./cmd/debugd

ui:
	cd web && npm ci && npm run build

run:
	go run ./cmd/debugd --open

test: test-go test-ui

test-go:
	go test -race ./...

test-ui:
	cd web && npm test

clean:
	rm -rf bin web/dist/assets

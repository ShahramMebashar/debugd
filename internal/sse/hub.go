// Package sse is a fan-out hub: clients subscribe over GET /events and receive
// trace summaries as they are ingested. One goroutine-safe hub, buffered
// per-client channels so a slow browser never blocks ingest.
package sse

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"

	"github.com/shaho/debugd/internal/trace"
)

type Hub struct {
	mu      sync.Mutex
	clients map[chan trace.Summary]struct{}
}

func NewHub() *Hub {
	return &Hub{clients: map[chan trace.Summary]struct{}{}}
}

// Broadcast pushes a summary to every subscriber, dropping it for any client
// whose buffer is full (never blocks the ingest path).
func (h *Hub) Broadcast(s trace.Summary) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.clients {
		select {
		case ch <- s:
		default: // slow client — drop rather than block
		}
	}
}

func (h *Hub) add() chan trace.Summary {
	ch := make(chan trace.Summary, 16)
	h.mu.Lock()
	h.clients[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *Hub) remove(ch chan trace.Summary) {
	h.mu.Lock()
	delete(h.clients, ch)
	h.mu.Unlock()
	close(ch)
}

// ServeHTTP streams text/event-stream to one client until it disconnects.
func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	// Flush headers immediately so the client receives the 200 and can start
	// reading before the first event arrives.
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ch := h.add()
	defer h.remove(ch)

	for {
		select {
		case <-r.Context().Done():
			return
		case s := <-ch:
			b, _ := json.Marshal(s)
			// A write error means the client is gone (and may not trigger
			// context cancellation behind some proxies) — stop the stream.
			if _, err := fmt.Fprintf(w, "event: trace\ndata: %s\n\n", b); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

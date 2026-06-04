// Package sse is a generic fan-out hub: clients subscribe over an HTTP endpoint
// and receive JSON events as they are produced. One goroutine-safe hub per
// stream (traces, logs), buffered per-client channels so a slow browser never
// blocks the producer.
package sse

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
)

// Hub fans out values of type T to all connected SSE clients. event is the
// SSE event name written for each message (e.g. "trace", "log").
type Hub[T any] struct {
	event   string
	mu      sync.Mutex
	clients map[chan T]struct{}
}

func NewHub[T any](event string) *Hub[T] {
	return &Hub[T]{event: event, clients: map[chan T]struct{}{}}
}

// Broadcast pushes a value to every subscriber, dropping it for any client
// whose buffer is full (never blocks the producer).
func (h *Hub[T]) Broadcast(v T) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.clients {
		select {
		case ch <- v:
		default: // slow client — drop rather than block
		}
	}
}

func (h *Hub[T]) add() chan T {
	ch := make(chan T, 16)
	h.mu.Lock()
	h.clients[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *Hub[T]) remove(ch chan T) {
	h.mu.Lock()
	delete(h.clients, ch)
	h.mu.Unlock()
	close(ch)
}

// ServeHTTP streams text/event-stream to one client until it disconnects.
func (h *Hub[T]) ServeHTTP(w http.ResponseWriter, r *http.Request) {
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
		case v := <-ch:
			b, _ := json.Marshal(v)
			// A write error means the client is gone (and may not trigger
			// context cancellation behind some proxies) — stop the stream.
			if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", h.event, b); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

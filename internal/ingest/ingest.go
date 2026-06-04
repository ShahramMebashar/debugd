// Package ingest is the HTTP edge: it decodes the wire protocol, validates the
// version, runs the analyzer, persists, and broadcasts. It depends on store,
// analyze, and sse via small interfaces (DIP) so each is testable in isolation.
package ingest

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/shaho/debugd/internal/analyze"
	"github.com/shaho/debugd/internal/trace"
)

const maxBody = 1 << 20 // 1 MiB — client caps payloads at 512 KB

type Store interface{ Add(*trace.Envelope) }
type Broadcaster interface{ Broadcast(trace.Summary) }

type Handler struct {
	Store Store
	Hub   Broadcaster
	// Threshold is the N+1 flag count; 0 means analyze.DefaultThreshold.
	Threshold int
}

// ServeHTTP handles POST /ingest. Lenient on unknown fields (forward compat),
// strict on protocol version. Always 204 on success — the client never waits.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBody))
	if err != nil {
		http.Error(w, "read error", http.StatusBadRequest)
		return
	}

	var e trace.Envelope
	if err := json.Unmarshal(body, &e); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if e.V != trace.ProtocolVersion {
		http.Error(w, "unsupported protocol version", http.StatusUnprocessableEntity)
		return
	}

	analyze.Detect(&e, h.Threshold)
	h.Store.Add(&e)
	h.Hub.Broadcast(e.Summarize())

	w.WriteHeader(http.StatusNoContent)
}

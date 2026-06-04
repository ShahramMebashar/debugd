// Package store holds analyzed traces in a fixed-size, mutex-guarded ring
// buffer. No persistence in the MVP — last N traces only.
package store

import (
	"sync"

	"github.com/shaho/debugd/internal/trace"
)

// Ring is a concurrency-safe circular buffer of traces with O(1) lookup by ID.
type Ring struct {
	mu    sync.RWMutex
	buf   []*trace.Envelope
	byID  map[string]*trace.Envelope
	next  int
	size  int
	count int
}

func New(size int) *Ring {
	if size < 1 {
		size = 1
	}
	return &Ring{
		buf:  make([]*trace.Envelope, size),
		byID: make(map[string]*trace.Envelope, size),
		size: size,
	}
}

// Add stores a trace, evicting the oldest when the buffer is full.
//
// Invariant: an *Envelope is fully built (analyzed) before Add and is never
// mutated afterward — eviction swaps the slot's pointer, it does not write into
// the old struct. So the pointers Get/Summaries hand out are safe to read
// concurrently with Add without copying.
func (r *Ring) Add(e *trace.Envelope) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if old := r.buf[r.next]; old != nil {
		delete(r.byID, old.TraceID)
	}
	r.buf[r.next] = e
	r.byID[e.TraceID] = e
	r.next = (r.next + 1) % r.size
	if r.count < r.size {
		r.count++
	}
}

// Get returns a trace by ID, or false if it has been evicted / never existed.
func (r *Ring) Get(id string) (*trace.Envelope, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	e, ok := r.byID[id]
	return e, ok
}

// Summaries returns all live traces, newest first.
func (r *Ring) Summaries() []trace.Summary {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]trace.Summary, 0, r.count)
	for i := 0; i < r.count; i++ {
		idx := (r.next - 1 - i + r.size*2) % r.size
		if e := r.buf[idx]; e != nil {
			out = append(out, e.Summarize())
		}
	}
	return out
}

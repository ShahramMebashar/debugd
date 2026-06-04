package logs

import "sync"

// Ring is a fixed-size, concurrency-safe buffer of recent log entries. No
// by-ID lookup is needed (entries carry everything), so it is simpler than the
// trace store's ring.
type Ring struct {
	mu    sync.RWMutex
	buf   []Entry
	next  int
	size  int
	count int
}

func NewRing(size int) *Ring {
	if size < 1 {
		size = 1
	}
	return &Ring{buf: make([]Entry, size), size: size}
}

func (r *Ring) Add(e Entry) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.buf[r.next] = e
	r.next = (r.next + 1) % r.size
	if r.count < r.size {
		r.count++
	}
}

// Reset clears the buffer — used when the tailer switches to a different log
// source so the previous app's lines don't linger.
func (r *Ring) Reset() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.buf = make([]Entry, r.size)
	r.next, r.count = 0, 0
}

// Recent returns the live entries, newest first.
func (r *Ring) Recent() []Entry {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]Entry, 0, r.count)
	for i := 0; i < r.count; i++ {
		idx := (r.next - 1 - i + r.size*2) % r.size
		out = append(out, r.buf[idx])
	}
	return out
}

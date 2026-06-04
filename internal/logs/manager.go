package logs

import (
	"context"
	"sync"
	"time"
)

// Broadcaster is the subset of the SSE hub the manager needs (decouples logs
// from the sse package).
type Broadcaster interface {
	Broadcast(Entry)
}

// Manager owns the (single) running tailer goroutine and lets it be re-pointed
// at a new directory at runtime — e.g. when the UI changes the log path. The
// ring and hub are stable; only the source changes.
type Manager struct {
	parent   context.Context
	ring     *Ring
	hub      Broadcaster
	interval time.Duration

	mu     sync.Mutex
	cancel context.CancelFunc
	path   string
}

func NewManager(parent context.Context, ring *Ring, hub Broadcaster, interval time.Duration) *Manager {
	return &Manager{parent: parent, ring: ring, hub: hub, interval: interval}
}

func (m *Manager) Path() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.path
}

// Start (re)points the tailer at dir; "" stops it. The ring is cleared so the
// previous source's lines don't linger when switching apps.
func (m *Manager) Start(dir string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.cancel != nil {
		m.cancel()
		m.cancel = nil
	}
	m.path = dir
	m.ring.Reset()
	if dir == "" {
		return
	}

	ctx, cancel := context.WithCancel(m.parent)
	m.cancel = cancel
	go Tail(ctx, dir, m.interval, func(e Entry) {
		m.ring.Add(e)
		m.hub.Broadcast(e)
	})
}

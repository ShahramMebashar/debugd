package logs

import (
	"sync"
	"testing"
	"time"
)

type fakeHub struct {
	mu  sync.Mutex
	got []Entry
}

func (f *fakeHub) Broadcast(e Entry) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.got = append(f.got, e)
}

func TestManager_TracksPathAndStops(t *testing.T) {
	m := NewManager(t.Context(), NewRing(10), &fakeHub{}, time.Hour)
	m.Start("/tmp/app-a/storage/logs")
	if m.Path() != "/tmp/app-a/storage/logs" {
		t.Fatalf("path = %q", m.Path())
	}
	m.Start("") // stop
	if m.Path() != "" {
		t.Errorf("path after stop = %q, want empty", m.Path())
	}
}

func TestManager_RestartResetsRing(t *testing.T) {
	ring := NewRing(10)
	ring.Add(Entry{ID: 1, Message: "from app A"})

	m := NewManager(t.Context(), ring, &fakeHub{}, time.Hour)
	m.Start("/tmp/app-b/storage/logs") // switching apps
	if got := len(ring.Recent()); got != 0 {
		t.Errorf("ring should be cleared when switching source, got %d entries", got)
	}
}

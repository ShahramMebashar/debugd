package logs

import (
	"fmt"
	"sync"
	"testing"
)

func TestRing_NewestFirstAndCap(t *testing.T) {
	r := NewRing(3)
	for i := 1; i <= 5; i++ {
		r.Add(Entry{ID: int64(i), Message: fmt.Sprintf("m%d", i)})
	}
	got := r.Recent()
	if len(got) != 3 {
		t.Fatalf("want 3 (cap), got %d", len(got))
	}
	// newest first → 5,4,3
	if got[0].ID != 5 || got[1].ID != 4 || got[2].ID != 3 {
		t.Errorf("order wrong: %d,%d,%d", got[0].ID, got[1].ID, got[2].ID)
	}
}

func TestRing_ConcurrentAddRecent(t *testing.T) {
	r := NewRing(50)
	var wg sync.WaitGroup
	for i := range 200 {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			r.Add(Entry{ID: int64(n)})
			r.Recent()
		}(i)
	}
	wg.Wait()
	if len(r.Recent()) != 50 {
		t.Errorf("want 50 after 200 adds, got %d", len(r.Recent()))
	}
}

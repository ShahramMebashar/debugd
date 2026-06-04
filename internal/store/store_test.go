package store

import (
	"fmt"
	"sync"
	"testing"

	"github.com/shaho/debugd/internal/trace"
)

func env(id string) *trace.Envelope {
	return &trace.Envelope{
		TraceID: id,
		Request: trace.Request{Method: "GET", Path: "/" + id},
	}
}

func TestRing_WraparoundEvictsOldest(t *testing.T) {
	r := New(3)
	for _, id := range []string{"t1", "t2", "t3", "t4"} {
		r.Add(env(id))
	}

	if _, ok := r.Get("t1"); ok {
		t.Error("t1 should have been evicted")
	}
	for _, id := range []string{"t2", "t3", "t4"} {
		if _, ok := r.Get(id); !ok {
			t.Errorf("%s should still be present", id)
		}
	}
}

func TestRing_SummariesNewestFirst(t *testing.T) {
	r := New(5)
	for _, id := range []string{"a", "b", "c"} {
		r.Add(env(id))
	}

	got := r.Summaries()
	want := []string{"c", "b", "a"}
	if len(got) != len(want) {
		t.Fatalf("want %d summaries, got %d", len(want), len(got))
	}
	for i, w := range want {
		if got[i].TraceID != w {
			t.Errorf("summary[%d] = %s, want %s", i, got[i].TraceID, w)
		}
	}
}

func TestRing_SummariesCountCapsAtSize(t *testing.T) {
	r := New(2)
	for _, id := range []string{"a", "b", "c", "d"} {
		r.Add(env(id))
	}
	if got := len(r.Summaries()); got != 2 {
		t.Errorf("want 2 summaries (size cap), got %d", got)
	}
}

func TestRing_GetMissing(t *testing.T) {
	r := New(3)
	if _, ok := r.Get("nope"); ok {
		t.Error("Get on empty ring should return false")
	}
}

// Run with -race: concurrent Add + reads must not race and must stay bounded.
func TestRing_ConcurrentAccess(t *testing.T) {
	r := New(50)
	var wg sync.WaitGroup
	for i := range 200 {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			r.Add(env(fmt.Sprintf("t%d", n)))
			r.Summaries()
			r.Get(fmt.Sprintf("t%d", n))
		}(i)
	}
	wg.Wait()

	if got := len(r.Summaries()); got != 50 {
		t.Errorf("want 50 live traces after 200 adds, got %d", got)
	}
}

package sse

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/shaho/debugd/internal/trace"
)

func TestHub_BroadcastFansOutToClient(t *testing.T) {
	hub := NewHub()
	ch := hub.add()
	defer hub.remove(ch)

	hub.Broadcast(trace.Summary{TraceID: "t1"})

	select {
	case got := <-ch:
		if got.TraceID != "t1" {
			t.Errorf("got %q, want t1", got.TraceID)
		}
	default:
		t.Fatal("expected a broadcast, channel was empty")
	}
}

func TestHub_DropsWhenClientBufferFull(t *testing.T) {
	hub := NewHub()
	ch := hub.add()
	defer hub.remove(ch)

	// Far more than the buffer; Broadcast must never block on a slow client.
	for range 100 {
		hub.Broadcast(trace.Summary{})
	}
	if got := len(ch); got != cap(ch) {
		t.Errorf("buffer should be full at %d, got %d", cap(ch), got)
	}
}

func TestHub_RemovedClientGetsNoBroadcast(t *testing.T) {
	hub := NewHub()
	ch := hub.add()
	hub.remove(ch)

	// Must not panic (no send on the closed, unregistered channel).
	hub.Broadcast(trace.Summary{TraceID: "x"})
}

func TestHub_ServeHTTPStreamsSSEFrame(t *testing.T) {
	hub := NewHub()
	srv := httptest.NewServer(http.HandlerFunc(hub.ServeHTTP))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, srv.URL, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Errorf("Content-Type = %q, want text/event-stream", ct)
	}

	// Broadcast until the client is registered and we read a frame.
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			default:
				hub.Broadcast(trace.Summary{TraceID: "live"})
				time.Sleep(5 * time.Millisecond)
			}
		}
	}()

	reader := bufio.NewReader(resp.Body)
	var sawEvent, sawData bool
	for !(sawEvent && sawData) {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("stream ended before a full frame (event=%v data=%v): %v", sawEvent, sawData, err)
		}
		if strings.HasPrefix(line, "event: trace") {
			sawEvent = true
		}
		if strings.HasPrefix(line, "data: ") && strings.Contains(line, "live") {
			sawData = true
		}
	}
}

package ingest

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/shaho/debugd/internal/trace"
)

type fakeStore struct{ added []*trace.Envelope }

func (f *fakeStore) Add(e *trace.Envelope) { f.added = append(f.added, e) }

type fakeHub struct{ sent []trace.Summary }

func (f *fakeHub) Broadcast(s trace.Summary) { f.sent = append(f.sent, s) }

func post(body string) (*httptest.ResponseRecorder, *fakeStore, *fakeHub) {
	store, hub := &fakeStore{}, &fakeHub{}
	h := &Handler{Store: store, Hub: hub}
	req := httptest.NewRequest(http.MethodPost, "/ingest", strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec, store, hub
}

const threeNPlusOne = `{
  "v":1,"trace_id":"t1","app":"x",
  "request":{"method":"GET","path":"/p","status":200,"duration_ms":5},
  "queries":[
    {"sql":"select * from a where id = ?","caller":"S.php:1","duration_ms":1},
    {"sql":"select * from a where id = ?","caller":"S.php:1","duration_ms":1},
    {"sql":"select * from a where id = ?","caller":"S.php:1","duration_ms":1}
  ],
  "logs":[]
}`

func TestIngest_ValidStoresAnalyzesBroadcasts(t *testing.T) {
	rec, store, hub := post(threeNPlusOne)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if len(store.added) != 1 {
		t.Fatalf("stored %d traces, want 1", len(store.added))
	}
	if n := len(store.added[0].NPlusOne); n != 1 {
		t.Errorf("analyzer should flag 1 N+1 group, got %d", n)
	}
	if len(hub.sent) != 1 || hub.sent[0].NPlusOne != 1 {
		t.Errorf("broadcast summary should report 1 N+1 group, got %+v", hub.sent)
	}
}

func TestIngest_RejectsBadInput(t *testing.T) {
	cases := []struct {
		name string
		body string
		want int
	}{
		{"wrong version", `{"v":2,"trace_id":"t","request":{},"queries":[],"logs":[]}`, http.StatusUnprocessableEntity},
		{"invalid json", `{not json`, http.StatusBadRequest},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec, store, _ := post(c.body)
			if rec.Code != c.want {
				t.Errorf("status = %d, want %d", rec.Code, c.want)
			}
			if len(store.added) != 0 {
				t.Error("bad input must not be stored")
			}
		})
	}
}

func TestIngest_RejectsNonPost(t *testing.T) {
	store, hub := &fakeStore{}, &fakeHub{}
	h := &Handler{Store: store, Hub: hub}
	req := httptest.NewRequest(http.MethodGet, "/ingest", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", rec.Code)
	}
}

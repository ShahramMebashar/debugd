package ingest

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// request()->all() is empty on a no-query GET → PHP encodes [] (a JSON array),
// not {}. The server must accept it, not reject the whole trace.
func TestIngest_EmptyArrayLogContext(t *testing.T) {
	body := `{"v":1,"trace_id":"t","app":"x",
	  "request":{"method":"GET","path":"/en","status":200,"duration_ms":5},
	  "queries":[],
	  "logs":[{"level":"info","message":"Rendering home page","context":[],"offset_ms":1}]}`
	store, hub := &fakeStore{}, &fakeHub{}
	h := &Handler{Store: store, Hub: hub}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/ingest", strings.NewReader(body)))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d (%s), want 204", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if len(store.added) != 1 {
		t.Errorf("trace should be stored, got %d", len(store.added))
	}
}

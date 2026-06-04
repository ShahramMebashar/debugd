package analyze

import (
	"reflect"
	"testing"

	"github.com/shaho/debugd/internal/trace"
)

func q(sql, caller string) trace.Query {
	return trace.Query{SQL: sql, Caller: caller, DurationMs: 1}
}

// Note: these grouper tests use identical SQL so they hold regardless of how
// NormalizeSQL is implemented. Literal-collapsing behavior is specced
// separately in TestNormalizeSQL.
func TestDetect_FlagsRepeatedQueriesFromSameCaller(t *testing.T) {
	e := &trace.Envelope{Queries: []trace.Query{
		q("select * from products where id = ?", "OrderService.php:48"),
		q("select * from products where id = ?", "OrderService.php:48"),
		q("select * from products where id = ?", "OrderService.php:48"),
	}}
	Detect(e, DefaultThreshold)
	if len(e.NPlusOne) != 1 {
		t.Fatalf("want 1 N+1 group, got %d", len(e.NPlusOne))
	}
	if e.NPlusOne[0].Count != 3 {
		t.Errorf("want count 3, got %d", e.NPlusOne[0].Count)
	}
}

// Regression for the unigate_media_assets report: two identical-shape queries
// from the same caller must flag at the default threshold of 2.
func TestDetect_TwoSameCallerFlaggedAtDefault(t *testing.T) {
	e := &trace.Envelope{Queries: []trace.Query{
		q("select * from media where id = ?", "Product.php:88"),
		q("select * from media where id = ?", "Product.php:88"),
	}}
	Detect(e, DefaultThreshold)
	if len(e.NPlusOne) != 1 {
		t.Errorf("2 same-caller queries should flag at default threshold, got %d groups", len(e.NPlusOne))
	}
}

func TestDetect_ThresholdIsConfigurable(t *testing.T) {
	two := func() *trace.Envelope {
		return &trace.Envelope{Queries: []trace.Query{
			q("select * from media where id = ?", "Product.php:88"),
			q("select * from media where id = ?", "Product.php:88"),
		}}
	}
	flagged := two()
	Detect(flagged, 2)
	notFlagged := two()
	Detect(notFlagged, 3)
	if len(flagged.NPlusOne) != 1 {
		t.Errorf("threshold 2: want 1 group, got %d", len(flagged.NPlusOne))
	}
	if len(notFlagged.NPlusOne) != 0 {
		t.Errorf("threshold 3: 2 queries must not flag, got %d", len(notFlagged.NPlusOne))
	}
}

// Regression for the HomeController:82 false positive: queries that share a
// caller but have a DIFFERENT shape must not be counted in the group. The group
// carries the exact member indices so the UI badges only the real members.
func TestDetect_RecordsMemberIndicesNotWholeCaller(t *testing.T) {
	e := &trace.Envelope{Queries: []trace.Query{
		q("select * from media where id = ?", "Home.php:82"),      // 0 — member
		q("select * from offers where status = ?", "Home.php:82"), // 1 — same caller, different shape: NOT a member
		q("select * from media where id = ?", "Home.php:82"),      // 2 — member
	}}
	Detect(e, DefaultThreshold)
	if len(e.NPlusOne) != 1 {
		t.Fatalf("want 1 group, got %d", len(e.NPlusOne))
	}
	if got := e.NPlusOne[0].Indices; !reflect.DeepEqual(got, []int{0, 2}) {
		t.Errorf("group indices = %v, want [0 2] (offers at 1 must be excluded)", got)
	}
}

func TestDetect_DifferentCallersNotConflated(t *testing.T) {
	// Same SQL shape but distinct call sites — each caller below threshold, so
	// they must not be merged into one group.
	e := &trace.Envelope{Queries: []trace.Query{
		q("select * from users where id = ?", "A.php:1"),
		q("select * from users where id = ?", "B.php:9"),
	}}
	Detect(e, DefaultThreshold)
	if len(e.NPlusOne) != 0 {
		t.Errorf("same SQL but split callers must not flag, got %d", len(e.NPlusOne))
	}
}

func TestDetect_SumsWastedMsPerGroup(t *testing.T) {
	mk := func(ms float64) trace.Query {
		return trace.Query{SQL: "select * from a where id = ?", Caller: "S.php:1", DurationMs: ms}
	}
	e := &trace.Envelope{Queries: []trace.Query{mk(2), mk(3), mk(5)}}
	Detect(e, DefaultThreshold)
	if len(e.NPlusOne) != 1 {
		t.Fatalf("want 1 group, got %d", len(e.NPlusOne))
	}
	if e.NPlusOne[0].TotalMs != 10 {
		t.Errorf("TotalMs = %v, want 10", e.NPlusOne[0].TotalMs)
	}
}

func TestDetect_OrdersGroupsByCountDesc(t *testing.T) {
	q := func(sql, caller string) trace.Query {
		return trace.Query{SQL: sql, Caller: caller, DurationMs: 1}
	}
	e := &trace.Envelope{Queries: []trace.Query{
		// 3× group A
		q("select * from a where id = ?", "A:1"), q("select * from a where id = ?", "A:1"),
		q("select * from a where id = ?", "A:1"),
		// 4× group B (should sort first)
		q("select * from b where id = ?", "B:1"), q("select * from b where id = ?", "B:1"),
		q("select * from b where id = ?", "B:1"), q("select * from b where id = ?", "B:1"),
	}}
	Detect(e, DefaultThreshold)
	if len(e.NPlusOne) != 2 {
		t.Fatalf("want 2 groups, got %d", len(e.NPlusOne))
	}
	if e.NPlusOne[0].Count != 4 || e.NPlusOne[1].Count != 3 {
		t.Errorf("groups not sorted by count desc: %d then %d", e.NPlusOne[0].Count, e.NPlusOne[1].Count)
	}
}

// TestNormalizeSQL is the spec for the contribution in normalize.go.
// Un-skip it once you implement literal/binding/IN-list collapsing.
func TestNormalizeSQL(t *testing.T) {
	cases := []struct{ name, in, want string }{
		{"numeric literal", "SELECT * FROM t WHERE id = 42", "select * from t where id = ?"},
		{"decimal literal", "select * from t where price = 9.99", "select * from t where price = ?"},
		{"string literal", "select * from t where name = 'bob'", "select * from t where name = ?"},
		{"escaped quote in string", "select * from t where n = 'O''Brien'", "select * from t where n = ?"},
		{"pg placeholder", "select * from t where id = $1", "select * from t where id = ?"},
		{"multiple pg placeholders", "select * from t where a = $1 and b = $2", "select * from t where a = ? and b = ?"},
		{"in list", "select * from t where id in (1, 2, 3)", "select * from t where id in (?)"},
		{"in list of bindings", "select * from t where id in (?, ?, ?)", "select * from t where id in (?)"},
		{"identifier with digit preserved", "select t1.id from users t1", "select t1.id from users t1"},
		{"already normalized passthrough", "select * from t where id = ?", "select * from t where id = ?"},
		{"whitespace", "select  *\nfrom   t", "select * from t"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := NormalizeSQL(c.in); got != c.want {
				t.Errorf("NormalizeSQL(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

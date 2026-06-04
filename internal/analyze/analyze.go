// Package analyze derives N+1 query problems from a raw trace. It is pure
// (no I/O, no state) so it is trivially table-test-able and -race clean.
package analyze

import (
	"sort"

	"github.com/shaho/debugd/internal/trace"
)

// DefaultThreshold is the minimum identical-shape query count to flag as N+1.
// Two repetitions of the same query shape from the same call site is already a
// real smell (matches Telescope/Clockwork); the operator can raise it.
const DefaultThreshold = 2

// Detect mutates e in place, filling e.NPlusOne. Grouping key is
// normalized_sql + caller so the same query from different code paths is not
// conflated (avoids false positives — correctness checklist §4). A group is
// flagged when its count reaches threshold (< 2 is treated as DefaultThreshold).
func Detect(e *trace.Envelope, threshold int) {
	if threshold < 2 {
		threshold = DefaultThreshold
	}
	type agg struct {
		count   int
		totalMs float64
		sql     string
		caller  string
		indices []int
	}
	groups := map[string]*agg{}
	for i, q := range e.Queries {
		norm := NormalizeSQL(q.SQL)
		key := norm + "|" + q.Caller
		g := groups[key]
		if g == nil {
			g = &agg{sql: norm, caller: q.Caller}
			groups[key] = g
		}
		g.count++
		g.totalMs += q.DurationMs
		g.indices = append(g.indices, i)
	}

	e.NPlusOne = e.NPlusOne[:0]
	for _, g := range groups {
		if g.count >= threshold {
			e.NPlusOne = append(e.NPlusOne, trace.NPlusOne{
				NormalizedSQL: g.sql,
				Caller:        g.caller,
				Count:         g.count,
				TotalMs:       g.totalMs,
				Indices:       g.indices,
				Suggestion:    Suggest(g.sql, g.caller),
			})
		}
	}

	// Map iteration is randomized; sort worst-first (count desc) for stable,
	// useful output. Tie-break on caller to keep it fully deterministic.
	sort.Slice(e.NPlusOne, func(i, j int) bool {
		if e.NPlusOne[i].Count != e.NPlusOne[j].Count {
			return e.NPlusOne[i].Count > e.NPlusOne[j].Count
		}
		return e.NPlusOne[i].Caller < e.NPlusOne[j].Caller
	})
}

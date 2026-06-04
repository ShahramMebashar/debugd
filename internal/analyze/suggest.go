package analyze

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/shaho/debugd/internal/trace"
)

var (
	reFrom    = regexp.MustCompile("from\\s+[\"`]?([a-z0-9_]+)")
	reInCol   = regexp.MustCompile("[\"`]?([a-z0-9_]+)[\"`]?\\s+in \\(\\?\\)")
	reEqIDCol = regexp.MustCompile("[\"`]?([a-z0-9_]*id)[\"`]?\\s*=\\s*\\?")
)

// Suggest infers an actionable eager-loading fix for an N+1 group from its
// normalized SQL and call site. Pure and heuristic — see suggest_test.go.
func Suggest(normalized, caller string) trace.Suggestion {
	s := trace.Suggestion{Kind: "unknown"}

	if m := reFrom.FindStringSubmatch(normalized); m != nil {
		s.Table = m[1]
	}
	s.Column = lookupColumn(normalized)
	if s.Table == "" || s.Column == "" {
		s.Fix = fmt.Sprintf("N+1 near %s — eager-load the related models with ->with('…').", caller)
		return s
	}

	switch {
	case s.Column == "id":
		// Repeated lookup by primary key → each child lazy-loads its parent.
		s.Kind = "belongs_to"
		s.Relation = singular(s.Table)
		s.Fix = fmt.Sprintf(
			"belongsTo N+1: %s is fetched by id once per row. Eager-load it — add ->with('%s') to the parent query near %s.",
			s.Table, s.Relation, caller)

	case strings.HasSuffix(s.Column, "_id"):
		base := strings.TrimSuffix(s.Column, "_id")
		if strings.Contains(normalized, base+"_type") {
			s.Kind = "morph"
			s.Fix = fmt.Sprintf(
				"Polymorphic (morph) N+1: %s is fetched per row via %s/%s_type. Eager-load the morph relation with ->with('…') on the parent query near %s.",
				s.Table, s.Column, base, caller)
		} else {
			s.Kind = "has_many"
			s.Fix = fmt.Sprintf(
				"hasMany N+1: %s is queried per row on %s. Eager-load the parent's relation with ->with('…') near %s.",
				s.Table, s.Column, caller)
		}

	default:
		s.Fix = fmt.Sprintf("N+1 on %s (filtered by %s) near %s — eager-load the relation with ->with('…').", s.Table, s.Column, caller)
	}

	return s
}

// lookupColumn finds the column that drove the repetition: prefer an IN-list
// (collapsed to `in (?)`), else an `<...>id = ?` equality.
func lookupColumn(normalized string) string {
	if m := reInCol.FindStringSubmatch(normalized); m != nil {
		return m[1]
	}
	if m := reEqIDCol.FindStringSubmatch(normalized); m != nil {
		return m[1]
	}
	return ""
}

// singular is a naive English singularizer for relation-name guessing.
func singular(table string) string {
	switch {
	case strings.HasSuffix(table, "ies"):
		return strings.TrimSuffix(table, "ies") + "y"
	case strings.HasSuffix(table, "ses"):
		return strings.TrimSuffix(table, "es")
	case strings.HasSuffix(table, "s"):
		return strings.TrimSuffix(table, "s")
	default:
		return table
	}
}

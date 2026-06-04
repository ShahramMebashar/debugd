package analyze

import (
	"regexp"
	"strings"
)

// Ordered substitutions. Strings and placeholders are collapsed before numbers
// so a `$1` or a digit inside a quoted literal is never matched on its own, and
// IN-lists are collapsed after their elements have all become `?`. Whitespace
// is normalized last.
var (
	strRe = regexp.MustCompile(`'(?:[^']|'')*'`)                  // 'bob', 'O''Brien'
	pgRe  = regexp.MustCompile(`\$\d+`)                           // $1, $2 (pgsql)
	numRe = regexp.MustCompile(`\b\d+(?:\.\d+)?\b`)               // 42, 1.5 (not the 1 in t1)
	inRe  = regexp.MustCompile(`in\s*\(\s*\?(?:\s*,\s*\?)*\s*\)`) // in (?, ?, ?)
	wsRe  = regexp.MustCompile(`\s+`)
)

// NormalizeSQL collapses a concrete query into its structural shape so that
// repeated queries differing only by literals/bindings group together. This
// is the core of N+1 detection — its precision decides false positives.
//
// Transforms (PROTOCOL.md §2.3):
//   - lowercase
//   - string literals, `$N` placeholders, and numeric literals → `?`
//   - `IN (?, ?, ?)` lists → `IN (?)`
//   - collapse whitespace, trim ends
//
// Regex-based by design: a real SQL tokenizer would be correct inside string
// literals but is far heavier than an N+1 heuristic warrants (KISS, AGENTS.md).
func NormalizeSQL(sql string) string {
	s := strings.ToLower(sql)
	s = strRe.ReplaceAllString(s, "?")
	s = pgRe.ReplaceAllString(s, "?")
	s = numRe.ReplaceAllString(s, "?")
	s = inRe.ReplaceAllString(s, "in (?)")
	s = wsRe.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

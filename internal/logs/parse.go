// Package logs reads Laravel/Monolog log files and serves them as a live,
// formatted stream — parser, directory poll-tailer, and a ring buffer.
package logs

import (
	"regexp"
	"strings"
)

// Entry is one parsed log record. It is also the wire shape (GET /api/logs,
// SSE event "log").
type Entry struct {
	ID      int64  `json:"id"`      // monotonic, assigned by the tailer
	Time    string `json:"time"`    // as written in the log
	Channel string `json:"channel"` // e.g. "local"
	Level   string `json:"level"`   // ERROR/INFO/WARNING/… ("" for raw lines)
	Message string `json:"message"`
	Detail  string `json:"detail"` // joined stack/context lines, may be ""
	Source  string `json:"source"` // filename, e.g. laravel-2026-06-04.log
}

// header matches Monolog's default LineFormatter:
//
//	[2026-06-04 19:49:15] local.ERROR: message …
//
// The timestamp tolerates a 'T' separator, fractional seconds, and a timezone.
var header = regexp.MustCompile(
	`^\[(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:\d{2}|Z)?)\] ` +
		`([\w.-]+)\.([A-Z]+): (.*)$`)

// Parser turns a stream of lines into entries. A header line starts a new
// entry; following non-header lines append to its Detail (stack traces, etc.).
// Not safe for concurrent use — one Parser per file.
type Parser struct {
	source  string
	pending *Entry
	detail  strings.Builder
}

func NewParser(source string) *Parser {
	return &Parser{source: source}
}

// Push feeds one line. It returns the now-completed previous entry (if a new
// header just started one), otherwise ok=false.
func (p *Parser) Push(line string) (Entry, bool) {
	line = strings.TrimRight(line, "\r")

	if m := header.FindStringSubmatch(line); m != nil {
		done, ok := p.finalize()
		p.pending = &Entry{Time: m[1], Channel: m[2], Level: m[3], Message: m[4], Source: p.source}
		return done, ok
	}

	if p.pending == nil {
		// A line with no recognizable header (PHP fatal, raw output): keep it
		// as its own entry so nothing is silently dropped.
		done, ok := p.finalize()
		p.pending = &Entry{Message: line, Source: p.source}
		return done, ok
	}

	if p.detail.Len() > 0 {
		p.detail.WriteByte('\n')
	}
	p.detail.WriteString(line)
	return Entry{}, false
}

// Flush returns the trailing pending entry, if any.
func (p *Parser) Flush() (Entry, bool) {
	return p.finalize()
}

func (p *Parser) finalize() (Entry, bool) {
	if p.pending == nil {
		return Entry{}, false
	}
	e := *p.pending
	e.Detail = p.detail.String()
	p.pending = nil
	p.detail.Reset()
	return e, true
}

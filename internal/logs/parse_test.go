package logs

import "testing"

// feed pushes lines through a parser and returns every finalized entry,
// including the trailing pending one via Flush.
func feed(p *Parser, lines ...string) []Entry {
	var out []Entry
	for _, l := range lines {
		if e, ok := p.Push(l); ok {
			out = append(out, e)
		}
	}
	if e, ok := p.Flush(); ok {
		out = append(out, e)
	}
	return out
}

func TestParser_SingleLine(t *testing.T) {
	got := feed(NewParser("laravel.log"), "[2026-06-04 19:49:15] local.INFO: Rendering home page")
	if len(got) != 1 {
		t.Fatalf("want 1 entry, got %d", len(got))
	}
	e := got[0]
	if e.Time != "2026-06-04 19:49:15" || e.Channel != "local" || e.Level != "INFO" {
		t.Errorf("header parsed wrong: %+v", e)
	}
	if e.Message != "Rendering home page" {
		t.Errorf("message = %q", e.Message)
	}
	if e.Source != "laravel.log" {
		t.Errorf("source = %q", e.Source)
	}
}

func TestParser_MultilineStackTrace(t *testing.T) {
	got := feed(NewParser("laravel.log"),
		`[2026-06-04 19:49:15] local.ERROR: Boom {"exception":"[object] (RuntimeException(code: 0): Boom)"}`,
		"[stacktrace]",
		"#0 /app/Http/Controllers/HomeController.php(31): boom()",
		"#1 {main}",
	)
	if len(got) != 1 {
		t.Fatalf("want 1 entry, got %d", len(got))
	}
	e := got[0]
	if e.Level != "ERROR" || e.Message == "" {
		t.Errorf("bad header: %+v", e)
	}
	if !contains(e.Detail, "#0 /app/Http/Controllers/HomeController.php(31)") {
		t.Errorf("detail missing stack trace: %q", e.Detail)
	}
}

func TestParser_SeparatesEntriesByHeader(t *testing.T) {
	got := feed(NewParser("laravel.log"),
		"[2026-06-04 19:49:15] queue.INFO: job started",
		"[2026-06-04 19:49:16] local.WARNING: slow query",
	)
	if len(got) != 2 {
		t.Fatalf("want 2 entries, got %d", len(got))
	}
	if got[0].Channel != "queue" || got[1].Channel != "local" {
		t.Errorf("channels = %q, %q", got[0].Channel, got[1].Channel)
	}
	if got[1].Level != "WARNING" {
		t.Errorf("second level = %q", got[1].Level)
	}
}

func TestParser_FractionalAndTimezone(t *testing.T) {
	got := feed(NewParser("l.log"), "[2026-06-04T19:49:15.123456+00:00] production.DEBUG: tick")
	if len(got) != 1 || got[0].Level != "DEBUG" {
		t.Fatalf("want 1 DEBUG entry, got %+v", got)
	}
}

func TestParser_NonLaravelLineBecomesRawMessage(t *testing.T) {
	got := feed(NewParser("l.log"), "PHP Warning: something on line 5")
	if len(got) != 1 {
		t.Fatalf("want 1 entry, got %d", len(got))
	}
	if got[0].Level != "" || got[0].Message != "PHP Warning: something on line 5" {
		t.Errorf("raw line not preserved: %+v", got[0])
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

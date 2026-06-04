package logs

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func appendTo(t *testing.T, path, s string) {
	t.Helper()
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if _, err := f.WriteString(s); err != nil {
		t.Fatal(err)
	}
}

func TestTail_SeedsThenReadsNewMultilineRecords(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "laravel.log")
	if err := os.WriteFile(p, []byte("[2026-06-04 10:00:00] local.INFO: one\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	var got []Entry
	tl := newTailer(dir, func(e Entry) { got = append(got, e) })

	tl.seed()
	if len(got) != 1 || got[0].Message != "one" {
		t.Fatalf("seed should emit existing tail, got %+v", got)
	}

	appendTo(t, p, "[2026-06-04 10:00:01] local.ERROR: boom\n#0 /app/x.php(1): boom()\n#1 {main}\n")
	tl.poll()

	if len(got) != 2 {
		t.Fatalf("want 2 entries after poll, got %d", len(got))
	}
	if got[1].Message != "boom" || !strings.Contains(got[1].Detail, "#0 /app/x.php(1)") {
		t.Errorf("multiline record parsed wrong: %+v", got[1])
	}
	if got[1].ID <= got[0].ID {
		t.Errorf("ids must be monotonic: %d then %d", got[0].ID, got[1].ID)
	}
}

func TestTail_HandlesRotationTruncation(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "laravel.log")
	os.WriteFile(p, []byte("[2026-06-04 10:00:00] local.INFO: before-rotation\n"), 0o644)

	var got []Entry
	tl := newTailer(dir, func(e Entry) { got = append(got, e) })
	tl.seed()

	// Rotate: replace with shorter content.
	os.WriteFile(p, []byte("[2026-06-04 11:00:00] local.INFO: after\n"), 0o644)
	tl.poll()

	if !hasMessage(got, "after") {
		t.Errorf("truncation/rotation not picked up: %+v", got)
	}
}

func TestTail_SeedsEveryFile(t *testing.T) {
	dir := t.TempDir()
	a := filepath.Join(dir, "messaging.log")
	b := filepath.Join(dir, "laravel.log")
	os.WriteFile(a, []byte("[2026-06-04 09:00:00] messaging.INFO: from messaging\n"), 0o644)
	os.WriteFile(b, []byte("[2026-06-04 10:00:00] local.INFO: from laravel\n"), 0o644)
	// laravel.log is the most-recently modified
	old := time.Now().Add(-time.Hour)
	os.Chtimes(a, old, old)

	var got []Entry
	tl := newTailer(dir, func(e Entry) { got = append(got, e) })
	tl.seed()

	if !hasMessage(got, "from messaging") || !hasMessage(got, "from laravel") {
		t.Fatalf("both files must be seeded, got %+v", got)
	}
	var idMsg, idLar int64
	for _, e := range got {
		switch e.Message {
		case "from messaging":
			idMsg = e.ID
		case "from laravel":
			idLar = e.ID
		}
	}
	if idLar <= idMsg {
		t.Errorf("newest file should emit last (higher id): laravel=%d messaging=%d", idLar, idMsg)
	}
}

func TestTail_PicksUpNewDailyFile(t *testing.T) {
	dir := t.TempDir()
	var got []Entry
	tl := newTailer(dir, func(e Entry) { got = append(got, e) })
	tl.seed() // empty dir

	os.WriteFile(filepath.Join(dir, "laravel-2026-06-04.log"),
		[]byte("[2026-06-04 10:00:00] daily.INFO: hello daily\n"), 0o644)
	tl.poll()

	if len(got) != 1 || got[0].Channel != "daily" || got[0].Source != "laravel-2026-06-04.log" {
		t.Errorf("new file not tailed: %+v", got)
	}
}

func hasMessage(es []Entry, msg string) bool {
	for _, e := range es {
		if e.Message == msg {
			return true
		}
	}
	return false
}

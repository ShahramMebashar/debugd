package settings

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadMissingReturnsZero(t *testing.T) {
	c := Load(t.TempDir())
	if c.LogsPath != "" {
		t.Errorf("missing config should be zero, got %+v", c)
	}
}

func TestSaveThenLoadRoundTrips(t *testing.T) {
	dir := t.TempDir()
	if err := Save(dir, Config{LogsPath: "/app/storage/logs"}); err != nil {
		t.Fatal(err)
	}
	if got := Load(dir).LogsPath; got != "/app/storage/logs" {
		t.Errorf("LogsPath = %q, want /app/storage/logs", got)
	}
	if _, err := os.Stat(filepath.Join(dir, "config.json")); err != nil {
		t.Errorf("config.json not written: %v", err)
	}
}

func TestSaveCreatesDir(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "nested", "debugd")
	if err := Save(dir, Config{LogsPath: "/x"}); err != nil {
		t.Fatalf("Save should mkdir -p: %v", err)
	}
	if Load(dir).LogsPath != "/x" {
		t.Error("round-trip through created dir failed")
	}
}

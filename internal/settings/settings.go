// Package settings persists the small set of UI-editable server settings to an
// auto-managed config.json (never hand-edited). Today that's just the log path.
package settings

import (
	"encoding/json"
	"os"
	"path/filepath"
)

const fileName = "config.json"

// Config is the persisted, UI-editable server settings.
type Config struct {
	LogsPath string `json:"logs_path"`
}

// Load reads dir/config.json, returning the zero Config when it is missing or
// unreadable (settings are best-effort — never fail startup over them).
func Load(dir string) Config {
	var c Config
	b, err := os.ReadFile(filepath.Join(dir, fileName))
	if err != nil {
		return c
	}
	_ = json.Unmarshal(b, &c)
	return c
}

// Save writes dir/config.json, creating dir if needed.
func Save(dir string, c Config) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, fileName), b, 0o644)
}

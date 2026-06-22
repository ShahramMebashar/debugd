// Command debugd is the single-binary trace server: ingest (POST /ingest),
// query API (GET /api/traces[/{id}]), live stream (GET /events), and the
// embedded UI at /. No config files — flags and env only.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"path/filepath"

	"github.com/shaho/debugd/internal/ingest"
	"github.com/shaho/debugd/internal/logs"
	"github.com/shaho/debugd/internal/settings"
	"github.com/shaho/debugd/internal/sse"
	"github.com/shaho/debugd/internal/store"
	"github.com/shaho/debugd/internal/trace"
	"github.com/shaho/debugd/web"
)

// version is injected at release time via -ldflags "-X main.version=...".
var version = "dev"

func main() {
	addr := flag.String("addr", envOr("DEBUGD_ADDR", ":9100"), "listen address")
	buffer := flag.Int("buffer", 500, "ring buffer size (traces kept)")
	nPlusOne := flag.Int("n-plus-one", envIntOr("DEBUGD_NPLUSONE", 2), "min repeated queries to flag as N+1")
	logsFlag := flag.String("logs", envOr("DEBUGD_LOGS", ""), "Laravel log dir to tail (default: ./storage/logs if present)")
	open := flag.Bool("open", false, "open the UI in a browser on start")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println("debugd", version)
		return
	}

	ring := store.New(*buffer)
	hub := sse.NewHub[trace.Summary]("trace")

	// Cancel on SIGINT/SIGTERM, then drain in-flight requests gracefully.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// When launched as a Tauri sidecar (DEBUGD_PARENT_WATCH set), the desktop app
	// keeps our stdin pipe open. If it exits — even on crash or force-quit — the
	// pipe closes and we read EOF, our cue to shut down so the server never
	// outlives the app. Gated by the env var so terminal/CI runs (where stdin may
	// be /dev/null and return EOF immediately) are never affected.
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	if os.Getenv("DEBUGD_PARENT_WATCH") != "" {
		go func() {
			io.Copy(io.Discard, os.Stdin)
			cancel()
		}()
	}

	// Log reader. The active source is resolved with precedence: explicit
	// --logs/DEBUGD_LOGS, else cwd ./storage/logs (so launching from an app root
	// auto-picks THAT app — never a stale saved path), else the UI-saved config.
	cfgDir := configDir()
	logsRing := logs.NewRing(2000)
	logsHub := sse.NewHub[logs.Entry]("log")
	logsMgr := logs.NewManager(ctx, logsRing, logsHub, 750*time.Millisecond)

	initial := resolveLogsDir(*logsFlag)
	if initial == "" {
		if saved := settings.Load(cfgDir).LogsPath; saved != "" {
			initial = resolveLogsDir(saved)
		}
	}
	logsMgr.Start(initial)
	if initial != "" {
		log.Printf("debugd tailing logs in %s", initial)
	}

	meta := func() map[string]any {
		return map[string]any{
			"logs":       logsMgr.Path() != "",
			"logs_path":  logsMgr.Path(),
			"version":    version,
			"addr":       *addr,
			"buffer":     *buffer,
			"n_plus_one": *nPlusOne,
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("ok"))
	})
	mux.Handle("POST /ingest", &ingest.Handler{Store: ring, Hub: hub, Threshold: *nPlusOne})
	mux.Handle("GET /events", hub)
	mux.HandleFunc("GET /api/traces", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, ring.Summaries())
	})
	mux.HandleFunc("GET /api/traces/{id}", func(w http.ResponseWriter, r *http.Request) {
		e, ok := ring.Get(r.PathValue("id"))
		if !ok {
			http.NotFound(w, r)
			return
		}
		writeJSON(w, e)
	})
	mux.HandleFunc("GET /api/logs", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, logsRing.Recent())
	})
	mux.Handle("GET /events/logs", logsHub)
	mux.HandleFunc("GET /api/meta", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, meta())
	})
	// Live, UI-editable settings. Local dev tool: the browser may point the
	// server at any directory on this machine — acceptable on localhost.
	mux.HandleFunc("POST /api/settings", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			LogsPath string `json:"logs_path"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		dir := ""
		if strings.TrimSpace(body.LogsPath) != "" {
			if dir = resolveLogsDir(body.LogsPath); dir == "" {
				http.Error(w, "path not found: "+body.LogsPath, http.StatusBadRequest)
				return
			}
		}
		logsMgr.Start(dir)
		if err := settings.Save(cfgDir, settings.Config{LogsPath: dir}); err != nil {
			log.Printf("debugd: could not save settings: %v", err)
		}
		writeJSON(w, meta())
	})
	mux.Handle("/", spaHandler(web.FS()))

	// SSE streams are long-lived, so no WriteTimeout; ReadHeaderTimeout guards
	// the ingest path against slow-header (Slowloris) clients.
	srv := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutCtx); err != nil {
			log.Printf("graceful shutdown failed: %v", err)
		}
	}()

	if *open {
		go browse("http://localhost" + normalizeAddr(*addr))
	}
	log.Printf("debugd %s listening on %s", version, *addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

// spaHandler serves embedded static assets, falling back to index.html so
// client-side routes resolve.
func spaHandler(root fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := fs.Stat(root, strings.TrimPrefix(r.URL.Path, "/")); err != nil && r.URL.Path != "/" {
			r.URL.Path = "/"
		}
		fileServer.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

// resolveLogsDir turns the --logs value into a directory to tail. Empty value
// auto-detects ./storage/logs (so running debugd from a project root just
// works); a file path resolves to its parent dir so daily/rotated siblings are
// caught too. Returns "" when there's nothing to tail.
// User-provided paths are restricted to the current working tree.
func resolveLogsDir(flagVal string) string {
	candidate := flagVal
	autodetect := candidate == ""
	if autodetect {
		candidate = filepath.Join("storage", "logs")
	}

	baseDir, err := os.Getwd()
	if err != nil {
		log.Printf("debugd: could not resolve working directory: %v", err)
		return ""
	}
	baseAbs, err := filepath.Abs(baseDir)
	if err != nil {
		log.Printf("debugd: could not resolve base path %q: %v", baseDir, err)
		return ""
	}
	if resolvedBase, err := filepath.EvalSymlinks(baseAbs); err == nil {
		baseAbs = resolvedBase
	}

	candidateAbs, err := filepath.Abs(candidate)
	if err != nil {
		if !autodetect {
			log.Printf("debugd: invalid --logs path %q: %v", flagVal, err)
		}
		return ""
	}
	if resolvedCandidate, err := filepath.EvalSymlinks(candidateAbs); err == nil {
		candidateAbs = resolvedCandidate
	}

	fi, err := os.Stat(candidateAbs)
	if err != nil {
		if !autodetect {
			log.Printf("debugd: --logs path %q not found, log reader disabled", flagVal)
		}
		return ""
	}

	targetDir := candidateAbs
	if !fi.IsDir() {
		targetDir = filepath.Dir(candidateAbs)
	}

	rel, err := filepath.Rel(baseAbs, targetDir)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || filepath.IsAbs(rel) {
		if !autodetect {
			log.Printf("debugd: --logs path %q is outside allowed base %q", flagVal, baseAbs)
		}
		return ""
	}
	return targetDir
}

// configDir is where UI-saved settings live (~/.config/debugd on Linux/mac).
func configDir() string {
	d, err := os.UserConfigDir()
	if err != nil {
		return "."
	}
	return filepath.Join(d, "debugd")
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envIntOr(k string, def int) int {
	if v := os.Getenv(k); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

// normalizeAddr turns a listen address into a localhost-relative ":port" for
// the --open browser URL (host part dropped — we always open localhost).
func normalizeAddr(addr string) string {
	_, port, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}
	return ":" + port
}

// browse opens url in the default browser, best-effort (failure is non-fatal —
// the address is always logged too).
func browse(url string) {
	name, args := openCommand(runtime.GOOS, url)
	if err := exec.Command(name, args...).Start(); err != nil {
		log.Printf("open %s in your browser", url)
	}
}

// openCommand returns the per-OS command to launch a URL. Split out so the OS
// dispatch is unit-testable without actually spawning a browser.
func openCommand(goos, url string) (string, []string) {
	switch goos {
	case "darwin":
		return "open", []string{url}
	case "windows":
		return "rundll32", []string{"url.dll,FileProtocolHandler", url}
	default:
		return "xdg-open", []string{url}
	}
}

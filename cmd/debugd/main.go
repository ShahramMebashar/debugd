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

	"github.com/shaho/debugd/internal/ingest"
	"github.com/shaho/debugd/internal/sse"
	"github.com/shaho/debugd/internal/store"
	"github.com/shaho/debugd/web"
)

// version is injected at release time via -ldflags "-X main.version=...".
var version = "dev"

func main() {
	addr := flag.String("addr", envOr("DEBUGD_ADDR", ":9100"), "listen address")
	buffer := flag.Int("buffer", 500, "ring buffer size (traces kept)")
	nPlusOne := flag.Int("n-plus-one", envIntOr("DEBUGD_NPLUSONE", 2), "min repeated queries to flag as N+1")
	open := flag.Bool("open", false, "open the UI in a browser on start")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println("debugd", version)
		return
	}

	ring := store.New(*buffer)
	hub := sse.NewHub()

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
	mux.Handle("/", spaHandler(web.FS()))

	// SSE streams are long-lived, so no WriteTimeout; ReadHeaderTimeout guards
	// the ingest path against slow-header (Slowloris) clients.
	srv := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	// Cancel on SIGINT/SIGTERM, then drain in-flight requests gracefully.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

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

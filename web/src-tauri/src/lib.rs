use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Address/URL the Go `debugd` server listens on (its default; see cmd/debugd/main.go).
/// It must be :9100 because the Laravel package POSTs traces to that exact port.
const SERVER_ADDR: &str = "127.0.0.1:9100";
const SERVER_URL: &str = "http://localhost:9100";

/// JS that turns the splash page into an error message when :9100 is held by a
/// foreign app (or our own server never came up). Reuses the splash markup.
const PORT_BUSY_JS: &str = "(function(){\
  var s=document.querySelector('.sub');\
  if(s){s.innerText='Port 9100 is in use by another app. Close it, then reopen dbugd.';}\
  var d=document.querySelector('.dot');\
  if(d){d.style.animation='none';d.style.background='#ef4444';}\
})();";

/// What is currently answering on :9100.
enum Health {
    /// Nothing listening — the port is free to bind.
    Free,
    /// Our debugd server (verified via /healthz returning "ok").
    Debugd,
    /// Some other process owns the port — reusing it would show a blank/foreign page.
    Foreign,
}

/// Probe :9100 and identify who is there. A bare TCP connect only tells us the
/// port is busy; we send a real `GET /healthz` and require debugd's `ok` body so
/// we never navigate the webview at an unrelated server.
fn health() -> Health {
    let addr = match SERVER_ADDR.parse() {
        Ok(a) => a,
        Err(_) => return Health::Free,
    };
    let mut stream = match TcpStream::connect_timeout(&addr, Duration::from_millis(300)) {
        Ok(s) => s,
        Err(_) => return Health::Free, // nothing accepting connections
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
    // HTTP/1.0 so the server closes the connection after the body (read-to-end terminates).
    if stream
        .write_all(b"GET /healthz HTTP/1.0\r\nHost: localhost\r\n\r\n")
        .is_err()
    {
        return Health::Foreign;
    }
    let mut buf = String::new();
    let _ = stream.read_to_string(&mut buf);
    if buf.contains(" 200") && buf.trim_end().ends_with("ok") {
        Health::Debugd
    } else {
        Health::Foreign
    }
}

/// Holds the spawned sidecar so we can kill it on exit. `None` when we reused an
/// already-running debugd instead of spawning our own.
struct Sidecar(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let handle = app.handle().clone();

            // Dev: Vite (devUrl) already serves the live UI and the developer runs
            // `go run ./cmd/debugd` separately — just reveal the window.
            if cfg!(debug_assertions) {
                if let Some(w) = handle.get_webview_window("main") {
                    let _ = w.show();
                }
                return Ok(());
            }

            // Production: figure out who owns :9100 before touching the webview.
            match health() {
                // A foreign app squats the port — show a clear message, not a blank page.
                Health::Foreign => {
                    log::warn!("port 9100 held by another process; not our debugd");
                    if let Some(w) = handle.get_webview_window("main") {
                        let _ = w.eval(PORT_BUSY_JS);
                        let _ = w.show();
                    }
                    return Ok(());
                }
                // Our debugd is already up (e.g. a CLI instance) — reuse it.
                Health::Debugd => {
                    log::info!("reusing existing debugd on {SERVER_ADDR}");
                    app.manage(Sidecar(Mutex::new(None)));
                }
                // Port free — spawn the bundled server, and ask it to die with us.
                Health::Free => {
                    let (mut rx, child) = app
                        .shell()
                        .sidecar("debugd")?
                        .env("DEBUGD_PARENT_WATCH", "1")
                        .spawn()?;
                    app.manage(Sidecar(Mutex::new(Some(child))));
                    tauri::async_runtime::spawn(async move {
                        while let Some(ev) = rx.recv().await {
                            if let CommandEvent::Stdout(b) | CommandEvent::Stderr(b) = ev {
                                log::info!("debugd: {}", String::from_utf8_lossy(&b).trim_end());
                            }
                        }
                    });
                }
            }

            // Wait for debugd to actually answer (verified, not just a bound port),
            // then navigate + reveal. If it never does — e.g. our spawn lost a race
            // for the port — fall back to the busy message instead of a blank page.
            std::thread::spawn(move || {
                let mut ready = false;
                for _ in 0..100 {
                    if matches!(health(), Health::Debugd) {
                        ready = true;
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(150));
                }
                if let Some(w) = handle.get_webview_window("main") {
                    if ready {
                        if let Ok(url) = SERVER_URL.parse() {
                            let _ = w.navigate(url);
                        }
                    } else {
                        let _ = w.eval(PORT_BUSY_JS);
                    }
                    let _ = w.show();
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Belt to the Go-side stdin watcher's braces: kill the child on a clean
            // quit. (The stdin-EOF watch in debugd handles crashes/force-quits.)
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                if let Some(state) = app.try_state::<Sidecar>() {
                    if let Some(child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}

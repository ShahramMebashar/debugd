<?php

declare(strict_types=1);

namespace Debugd;

use Debugd\Contracts\Sender;
use Debugd\Http\TraceMiddleware;
use Debugd\Logging\DebugdHandler;
use Debugd\Transport\Sender as GuzzleSender;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;
use Illuminate\Database\Events\QueryExecuted;

/**
 * Auto-discovered provider. The whole package is INERT unless DEBUGD_HOST is
 * set — when unset, no listeners, no middleware, zero overhead (correctness
 * checklist §4). This single guard is the package's on/off switch.
 */
final class DebugdServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Bindings are lazy and free — register them unconditionally so they
        // exist regardless of env-read timing. Only the *active* listeners
        // (boot) are gated on enabled(); that is what "inert" means (§4).

        // Worker-persistent (true singleton) so it survives across Octane
        // requests — the basis for per-worker request count and leak detection.
        $this->app->singleton(WorkerState::class);

        // Per-request timing anchored to the SAPI request start (before boot).
        $this->app->scoped(Timing::class, fn () => new Timing(
            (float) ($_SERVER['REQUEST_TIME_FLOAT'] ?? microtime(true)),
        ));

        // Scoped = fresh per request, Octane-safe. Anchored to request start.
        // Use the resolving container ($app), not $this->app — under Octane the
        // request lives in a sandbox clone, and $this->app is the base app.
        $this->app->scoped(Collector::class, fn ($app) => new Collector(
            $app->make(Timing::class)->requestStart,
        ));

        // Singleton transport (the contract) — one Guzzle client reused across
        // requests. Host resolved lazily, so an unset host never matters unless
        // something actually sends.
        $this->app->singleton(GuzzleSender::class, fn () => new GuzzleSender((string) env('DEBUGD_HOST')));
        $this->app->bind(Sender::class, GuzzleSender::class);
    }

    public function boot(Kernel $kernel): void
    {
        if (! $this->enabled()) {
            return;
        }

        // Marker the debugd() helper checks — present only when recording.
        $this->app->instance('debugd.recording', true);

        $kernel->prependMiddleware(TraceMiddleware::class);
        $this->captureQueries();
        $this->captureLogs();
        $this->captureExceptions();

        // Stamp boot-complete time once the framework finishes booting.
        $this->app->booted(function (): void {
            $this->app->make(Timing::class)->bootedAt = microtime(true);
        });
    }

    /**
     * Hook the framework's exception handler so every *reported* throwable lands
     * on the current request's Collector. Uses reportable() when available
     * (Laravel's default handler) — purely additive, never swallows the report.
     */
    private function captureExceptions(): void
    {
        $this->callAfterResolving(ExceptionHandler::class, function ($handler): void {
            if (! method_exists($handler, 'reportable')) {
                return;
            }
            $handler->reportable(function (\Throwable $e): void {
                $this->quietly(function () use ($e): void {
                    $base = base_path() . DIRECTORY_SEPARATOR;
                    // app() (not $this->app) so we hit the CURRENT request's
                    // container — under Octane $this->app is the base app, but
                    // the request (and the Collector the middleware flushes)
                    // lives in a per-request sandbox clone.
                    app(Collector::class)->setException([
                        'class' => $e::class,
                        'message' => $e->getMessage(),
                        'file' => str_replace($base, '', $e->getFile()) . ':' . $e->getLine(),
                        'trace' => substr($e->getTraceAsString(), 0, 4000),
                    ]);
                });
            });
        });
    }

    private function captureQueries(): void
    {
        // Raw bindings are PII-risky → opt-in only (§4). Resolved once here,
        // not per query.
        $captureBindings = filter_var(env('DEBUGD_CAPTURE_BINDINGS', false), FILTER_VALIDATE_BOOL);

        DB::listen(function (QueryExecuted $q) use ($captureBindings): void {
            $this->quietly(function () use ($q, $captureBindings): void {
                // app() resolves the current request's (sandbox) Collector —
                // see captureExceptions(); $this->app is the base app under Octane.
                /** @var Collector $c */
                $c = app(Collector::class);
                $entry = [
                    'sql' => $q->sql,
                    'bindings_count' => count($q->bindings),
                    'duration_ms' => round($q->time, 2),
                    'connection' => $q->connectionName,
                    'caller' => $this->caller(),
                    'offset_ms' => $c->offsetMs(),
                ];
                if ($captureBindings) {
                    $entry['bindings'] = $q->bindings;
                }
                $c->addQuery($entry);
            });
        });
    }

    private function captureLogs(): void
    {
        // Append our Monolog handler so log records flow into the Collector.
        $logger = $this->app['log']->getLogger();
        if (method_exists($logger, 'pushHandler')) {
            $logger->pushHandler(new DebugdHandler());
        }
    }

    /**
     * Run a capture callback, swallowing anything it throws. Tracing must never
     * affect the host app (§4) — this enforces that guarantee by construction
     * at every capture surface, rather than assuming the body cannot throw.
     */
    private function quietly(callable $fn): void
    {
        try {
            $fn();
        } catch (\Throwable) {
            // Intentionally silent.
        }
    }

    /** First application stack frame — the N+1 grouping anchor. */
    private function caller(): string
    {
        return \Debugd\Support\Caller::resolve();
    }

    private function enabled(): bool
    {
        return (string) env('DEBUGD_HOST', '') !== '';
    }
}

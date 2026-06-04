<?php

declare(strict_types=1);

namespace Debugd\Http;

use Closure;
use Debugd\Collector;
use Debugd\Contracts\Sender;
use Debugd\Timing;
use Debugd\WorkerState;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Uid\UuidV7;

/**
 * Terminable, globally-prepended middleware. Assigns a UUIDv7 trace id and,
 * AFTER the response is sent (terminate()), serializes the Collector and ships
 * it. Flush runs off the request critical path → zero user-facing latency.
 */
final class TraceMiddleware
{
    public function __construct(
        private readonly Collector $collector,
        private readonly Sender $sender,
        private readonly Timing $timing,
        private readonly WorkerState $worker,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        // State lives on the scoped Collector: terminate() runs on a different
        // middleware instance, so instance fields would not survive.
        $this->collector->setTraceId((string) (new UuidV7()));
        $request->attributes->set('debugd_trace_id', $this->collector->traceId());

        return $next($request);
    }

    public function terminate(Request $request, Response $response): void
    {
        if (filter_var(getenv('DEBUGD_DEBUG') ?: ($_SERVER['DEBUGD_DEBUG'] ?? false), FILTER_VALIDATE_BOOL)) {
            error_log(sprintf(
                '[debugd] terminate() reached: %s %s -> %d (queries=%d logs=%d)',
                $request->getMethod(), $request->path(), $response->getStatusCode(),
                $this->collector->queryCount(), $this->collector->logCount(),
            ));
        }

        $memoryMb = round(memory_get_peak_usage(true) / 1048576, 1);
        $bindingKeys = array_keys(app()->getBindings());
        $newBindings = $this->worker->recordBindings($bindingKeys);

        $this->collector->setOctane([
            'running' => class_exists(\Laravel\Octane\Octane::class),
            'worker_pid' => $this->worker->pid,
            'worker_requests' => $this->worker->requests + 1, // includes this one
            'worker_memory_start_mb' => $this->worker->baselineMemoryMb ?? $memoryMb,
            'memory_growth_mb' => $this->worker->growthMb($memoryMb),
            'bindings' => count($bindingKeys),
            'new_bindings' => array_slice($newBindings, 0, 15),
        ]);
        $this->worker->record($memoryMb);

        $envelope = $this->collector->toEnvelope(
            $this->collector->traceId(),
            (string) config('app.name', 'app'),
            [
                'method' => $request->getMethod(),
                'path' => '/' . ltrim($request->path(), '/'),
                'route' => $request->route()?->getName() ?? '',
                'status' => $response->getStatusCode(),
                'duration_ms' => $this->collector->offsetMs(), // total: request start → now
                'boot_ms' => $this->timing->bootMs(),
                'memory_mb' => $memoryMb,
                'started_at' => now()->toIso8601String(),
            ],
        );

        // Never throws, never blocks meaningfully (timeouts in Sender).
        $this->sender->send($envelope);
    }
}

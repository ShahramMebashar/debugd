<?php

declare(strict_types=1);

namespace Debugd\Http;

use Closure;
use Debugd\Collector;
use Debugd\Contracts\Sender;
use Debugd\Timing;
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
                'memory_mb' => round(memory_get_peak_usage(true) / 1048576, 1),
                'started_at' => now()->toIso8601String(),
            ],
        );

        // Never throws, never blocks meaningfully (timeouts in Sender).
        $this->sender->send($envelope);
    }
}

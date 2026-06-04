<?php

declare(strict_types=1);

namespace Debugd;

/**
 * Per-request buffer of queries, logs, and the exception. Registered as a
 * scoped singleton so each request (incl. Octane/FrankenPHP workers) gets a
 * fresh instance — no state bleed between requests.
 *
 * Pure data sink: no I/O. The middleware serializes it in terminate().
 */
final class Collector
{
    /** @var array<int, array<string, mixed>> */
    private array $queries = [];

    /** @var array<int, array<string, mixed>> */
    private array $logs = [];

    private ?array $exception = null;

    private string $traceId = '';

    private readonly float $startedAt;

    /** Payload budget: drop oldest logs first when exceeded (plan §2.1). */
    private const MAX_BYTES = 512 * 1024;

    public function __construct(?float $startedAt = null)
    {
        // Anchor to the true request start so offsets/duration include boot.
        $this->startedAt = $startedAt ?? microtime(true);
    }

    public function offsetMs(): float
    {
        return round((microtime(true) - $this->startedAt) * 1000, 1);
    }

    /**
     * Trace id lives on the Collector (not the middleware) because Laravel
     * resolves a fresh middleware instance for terminate() — only the scoped
     * Collector survives both handle() and terminate().
     */
    public function setTraceId(string $id): void
    {
        $this->traceId = $id;
    }

    public function traceId(): string
    {
        return $this->traceId;
    }

    /** @param array<string,mixed> $q */
    public function addQuery(array $q): void
    {
        $this->queries[] = $q;
    }

    /** @param array<string,mixed> $log */
    public function addLog(array $log): void
    {
        $this->logs[] = $log;
    }

    /** @param array<string,mixed> $e */
    public function setException(array $e): void
    {
        $this->exception = $e;
    }

    /**
     * @param array<string,mixed> $request
     * @return array<string,mixed> Wire protocol v1 envelope.
     */
    public function toEnvelope(string $traceId, string $app, array $request): array
    {
        $payload = [
            'v' => 1,
            'trace_id' => $traceId,
            'app' => $app,
            'request' => $request,
            'queries' => $this->queries,
            'logs' => $this->logs,
            'exception' => $this->exception,
        ];

        // Enforce the budget: drop oldest logs first, then fall back to oldest
        // queries (an N+1 storm can blow the cap on queries alone). Re-encode
        // once per drop so the cap is actually guaranteed, not best-effort.
        $size = strlen((string) json_encode($payload));
        while ($size > self::MAX_BYTES
            && ($payload['logs'] !== [] || $payload['queries'] !== [])) {
            if ($payload['logs'] !== []) {
                array_shift($payload['logs']);
            } else {
                array_shift($payload['queries']);
            }
            $size = strlen((string) json_encode($payload));
        }

        return $payload;
    }
}

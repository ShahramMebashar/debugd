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

    /** @var array<int, array<string, mixed>> */
    private array $dumps = [];

    /** @var array<int, array<string, mixed>> */
    private array $measures = [];

    private ?array $exception = null;

    private ?array $octane = null;

    private string $traceId = '';

    private readonly float $startedAt;

    /** Payload budget: drop oldest logs first when exceeded (plan §2.1). */
    private const MAX_BYTES = 512 * 1024;

    /**
     * Canonical JSON flags for the wire body. The cap measurement and the Sender
     * MUST use the same flags, or the cap measures a different length than what
     * is sent. SUBSTITUTE/PARTIAL guarantee encoding never returns false on
     * arbitrary captured bytes (e.g. request()->all()).
     */
    public const JSON_FLAGS = JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR | JSON_UNESCAPED_UNICODE;

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

    public function queryCount(): int
    {
        return count($this->queries);
    }

    public function logCount(): int
    {
        return count($this->logs);
    }

    /** @param array<string,mixed> $log */
    public function addLog(array $log): void
    {
        $this->logs[] = $log;
    }

    /** @param array<string,mixed> $dump */
    public function addDump(array $dump): void
    {
        $this->dumps[] = $dump;
    }

    /** @param array<string,mixed> $measure */
    public function addMeasure(array $measure): void
    {
        $this->measures[] = $measure;
    }

    private int $groupSeq = 0;

    /** A fresh id tying the spans of one concurrently() batch together. */
    public function nextGroup(): string
    {
        return 'g' . (++$this->groupSeq);
    }

    /** @param array<string,mixed> $e */
    public function setException(array $e): void
    {
        $this->exception = $e;
    }

    /** @param array<string,mixed> $octane */
    public function setOctane(array $octane): void
    {
        $this->octane = $octane;
    }

    /**
     * @param array<string,mixed> $request
     * @return array<string,mixed> Wire protocol v1 envelope.
     */
    public function toEnvelope(string $traceId, string $app, array $request, string $projectRoot = ''): array
    {
        $payload = [
            'v' => 1,
            'trace_id' => $traceId,
            'app' => $app,
            'project_root' => $projectRoot,
            'request' => $request,
            'queries' => $this->queries,
            'logs' => $this->logs,
            'dumps' => $this->dumps,
            'measures' => $this->measures,
            'exception' => $this->exception,
            'octane' => $this->octane,
        ];

        // Enforce the budget: drop oldest logs first, then fall back to oldest
        // queries (an N+1 storm can blow the cap on queries alone). Re-encode
        // once per drop so the cap is actually guaranteed, not best-effort.
        //
        // Measure with the SAME flags the Sender uses — arbitrary bytes flow in
        // here (e.g. request()->all()), and a plain json_encode returns false on
        // invalid UTF-8, which would silently disable the cap and let an
        // oversized payload get rejected by the server (the whole trace vanishes).
        $size = $this->encodedSize($payload);
        while ($size > self::MAX_BYTES
            && ($payload['logs'] !== [] || $payload['queries'] !== [])) {
            if ($payload['logs'] !== []) {
                array_shift($payload['logs']);
            } else {
                array_shift($payload['queries']);
            }
            $size = $this->encodedSize($payload);
        }

        return $payload;
    }

    /** Byte length of the payload as the wire actually encodes it. */
    private function encodedSize(array $payload): int
    {
        return strlen((string) json_encode($payload, self::JSON_FLAGS));
    }
}

<?php

declare(strict_types=1);

namespace Debugd\Transport;

use Debugd\Collector;
use Debugd\Contracts\Sender as SenderContract;
use GuzzleHttp\Client;

/**
 * The only network boundary. POSTs an envelope to the debugd server with tight
 * timeouts, fully swallowing every failure — tracing must never affect the app.
 */
final class Sender implements SenderContract
{
    private Client $client;

    public function __construct(private readonly string $host)
    {
        $this->client = new Client([
            'base_uri' => rtrim($host, '/') . '/',
            'timeout' => 0.1,
            'connect_timeout' => 0.05,
            'http_errors' => false,
        ]);
    }

    /** @param array<string,mixed> $envelope */
    public function send(array $envelope): void
    {
        try {
            // Same flags as the size cap (Collector::JSON_FLAGS), so what we
            // measured is what we send. SUBSTITUTE/PARTIAL tolerate arbitrary
            // captured bytes; on the rare total failure we still ship a minimal
            // envelope so the request never silently disappears.
            $body = json_encode($envelope, Collector::JSON_FLAGS);
            if ($body === false) {
                $body = json_encode($this->minimal($envelope), Collector::JSON_FLAGS);
            }
            if ($body === false) {
                return;
            }
            $this->client->post('ingest', [
                'headers' => ['Content-Type' => 'application/x-ndjson'],
                'body' => $body . "\n",
            ]);
        } catch (\Throwable) {
            // Silent by design — never surface tracing failures to the app.
        }
    }

    /** A skeleton envelope that always encodes — the request still shows up. */
    private function minimal(array $envelope): array
    {
        return [
            'v' => $envelope['v'] ?? 1,
            'trace_id' => $envelope['trace_id'] ?? '',
            'app' => $envelope['app'] ?? '',
            'request' => $envelope['request'] ?? [],
            'queries' => [],
            'logs' => [],
            'dumps' => [],
            'measures' => [],
            'exception' => null,
            'octane' => $envelope['octane'] ?? null,
        ];
    }
}

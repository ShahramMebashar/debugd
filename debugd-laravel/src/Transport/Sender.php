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
        $debug = filter_var(getenv('DEBUGD_DEBUG') ?: ($_SERVER['DEBUGD_DEBUG'] ?? false), FILTER_VALIDATE_BOOL);
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
                $debug && error_log('[debugd] encode failed entirely — nothing sent');
                return;
            }
            $debug && error_log(sprintf('[debugd] POST %s/ingest (%d bytes, trace=%s)', $this->host, strlen($body), $envelope['trace_id'] ?? '?'));
            $response = $this->client->post('ingest', [
                'headers' => ['Content-Type' => 'application/x-ndjson'],
                'body' => $body . "\n",
            ]);
            $debug && error_log(sprintf('[debugd] server responded %d', $response->getStatusCode()));
        } catch (\Throwable $e) {
            // Silent by design — never surface tracing failures to the app.
            $debug && error_log('[debugd] send failed: ' . $e->getMessage());
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

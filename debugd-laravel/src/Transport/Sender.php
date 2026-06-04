<?php

declare(strict_types=1);

namespace Debugd\Transport;

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
            // Arbitrary app log context flows in here, so tolerate bad UTF-8
            // rather than emitting a corrupt body.
            $body = json_encode($envelope, JSON_INVALID_UTF8_SUBSTITUTE);
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
}

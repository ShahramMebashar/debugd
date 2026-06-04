<?php

declare(strict_types=1);

use Debugd\Collector;

it('caps the payload even when a value contains invalid UTF-8', function () {
    $c = new Collector();
    // > 512KB of queries...
    foreach (range(1, 5000) as $i) {
        $c->addQuery(['sql' => str_repeat('x', 200), 'bindings_count' => 0, 'duration_ms' => 0.1,
            'connection' => 'pgsql', 'caller' => 'A.php:1', 'offset_ms' => (float) $i]);
    }
    // ...plus a log whose context has invalid UTF-8 (e.g. from request()->all()).
    $c->addLog(['level' => 'info', 'message' => 'home', 'context' => ['q' => "\xB1\x31\x32"], 'offset_ms' => 1.0]);

    $env = $c->toEnvelope('t', 'app', ['method' => 'GET', 'path' => '/', 'route' => '',
        'status' => 200, 'duration_ms' => 1.0, 'started_at' => 'now']);

    // The body the Sender will actually POST (substitute flags) must be under cap.
    $body = json_encode($env, JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR);
    expect(strlen((string) $body))->toBeLessThanOrEqual(512 * 1024);
});

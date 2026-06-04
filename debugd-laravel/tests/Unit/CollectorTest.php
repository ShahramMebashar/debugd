<?php

declare(strict_types=1);

use Debugd\Collector;

it('builds a v1 envelope with the captured data', function () {
    $c = new Collector();
    $c->addQuery(['sql' => 'select 1', 'bindings_count' => 0, 'duration_ms' => 0.3,
        'connection' => 'pgsql', 'caller' => 'App.php:1', 'offset_ms' => 1.0]);

    $env = $c->toEnvelope('trace-1', 'froshly', [
        'method' => 'GET', 'path' => '/', 'route' => '', 'status' => 200,
        'duration_ms' => 5.0, 'started_at' => '2026-06-04T00:00:00Z',
    ]);

    expect($env['v'])->toBe(1)
        ->and($env['trace_id'])->toBe('trace-1')
        ->and($env['queries'])->toHaveCount(1)
        ->and($env['exception'])->toBeNull();
});

$req = ['method' => 'GET', 'path' => '/', 'route' => '',
    'status' => 200, 'duration_ms' => 1.0, 'started_at' => 'now'];

it('caps the payload by dropping the oldest logs first', function () use ($req) {
    $c = new Collector();
    $c->addQuery(['sql' => 'select 1', 'bindings_count' => 0, 'duration_ms' => 0.1,
        'connection' => 'pgsql', 'caller' => 'App.php:1', 'offset_ms' => 0.0]);
    foreach (range(1, 5000) as $i) {
        $c->addLog(['level' => 'info', 'message' => str_repeat('x', 200),
            'context' => [], 'offset_ms' => (float) $i]);
    }

    $env = $c->toEnvelope('t', 'app', $req);

    expect(strlen(json_encode($env)))->toBeLessThanOrEqual(512 * 1024)
        ->and($env['queries'])->toHaveCount(1); // logs dropped before queries
});

it('enforces the cap even when queries alone exceed the budget', function () use ($req) {
    $c = new Collector();
    foreach (range(1, 4000) as $i) {
        $c->addQuery(['sql' => str_repeat('x', 200), 'bindings_count' => 0,
            'duration_ms' => 0.1, 'connection' => 'pgsql', 'caller' => 'App.php:1',
            'offset_ms' => (float) $i]);
    }

    $env = $c->toEnvelope('t', 'app', $req);

    expect(strlen(json_encode($env)))->toBeLessThanOrEqual(512 * 1024);
});

<?php

declare(strict_types=1);

use Debugd\Collector;

it('gives each request a fresh collector — no state bleed (Octane-safe)', function () {
    // Simulate two requests on one long-lived worker: the framework flushes
    // scoped instances between them, which is exactly what Octane does.
    $first = $this->app->make(Collector::class);
    $first->addLog(['level' => 'info', 'message' => 'req-1', 'context' => [], 'offset_ms' => 1.0]);
    $first->setTraceId('trace-1');

    $this->app->forgetScopedInstances();

    $second = $this->app->make(Collector::class);
    expect($second)->not->toBe($first)
        ->and($second->traceId())->toBe('');

    $env = $second->toEnvelope('trace-2', 'app', [
        'method' => 'GET', 'path' => '/', 'route' => '', 'status' => 200,
        'duration_ms' => 1.0, 'started_at' => 'now',
    ]);

    expect($env['logs'])->toBeEmpty(); // none of request 1's state leaked
});

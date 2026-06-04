<?php

declare(strict_types=1);

use Debugd\Collector;
use Debugd\Contracts\Sender;
use Debugd\Tests\Support\FakeSender;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

it('ships the full trace when info() + bench(query) are used together', function () {
    $fake = new FakeSender();
    $this->app->instance(Sender::class, $fake);

    Route::get('/_home', function () {
        debugd()->info('Rendering home page', request()->all());
        debugd()->bench('home_page_rendering', fn () => DB::select('select ? as n', [1]));
        return 'ok';
    });

    $this->get('/_home?foo=bar')->assertOk();

    $env = $fake->sent[0] ?? null;
    expect($env)->not->toBeNull()
        ->and($env['logs'])->not->toBeEmpty()
        ->and($env['measures'])->toHaveCount(1)
        ->and($env['queries'])->toHaveCount(1);
});

// Regression: invalid UTF-8 in a captured value (common from request()->all())
// used to disable the size cap, letting an oversized payload be rejected by the
// server — the whole trace vanished. The cap must hold regardless of bytes.
it('keeps the payload under cap even with invalid UTF-8 in context', function () {
    $c = new Collector();
    foreach (range(1, 5000) as $i) {
        $c->addQuery(['sql' => str_repeat('x', 200), 'bindings_count' => 0, 'duration_ms' => 0.1,
            'connection' => 'pgsql', 'caller' => 'A.php:1', 'offset_ms' => (float) $i]);
    }
    $c->addLog(['level' => 'info', 'message' => 'home', 'context' => ['q' => "\xB1\x31\x32"], 'offset_ms' => 1.0]);

    $env = $c->toEnvelope('t', 'app', ['method' => 'GET', 'path' => '/', 'route' => '',
        'status' => 200, 'duration_ms' => 1.0, 'started_at' => 'now']);

    $body = json_encode($env, Collector::JSON_FLAGS);
    expect(strlen((string) $body))->toBeLessThanOrEqual(512 * 1024);
});

<?php

declare(strict_types=1);

use Debugd\Contracts\Sender;
use Debugd\Tests\Support\FakeSender;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

it('repro: info + bench(query) still ships the full trace', function () {
    $fake = new FakeSender();
    $this->app->instance(Sender::class, $fake);

    Route::get('/_home', function () {
        debugd()->info('Rendering home page', request()->all());
        debugd()->bench('home_page_rendering', function () {
            DB::select('select ? as n', [1]);
        });
        return 'ok';
    });

    $this->get('/_home?foo=bar&n=2')->assertOk();

    expect($fake->sent)->toHaveCount(1);
    $env = $fake->sent[0];
    expect($env['logs'])->not->toBeEmpty()
        ->and($env['measures'])->toHaveCount(1)
        ->and($env['queries'])->toHaveCount(1);
});

it('repro: invalid UTF-8 in info context does not drop the trace', function () {
    $fake = new FakeSender();
    $this->app->instance(Sender::class, $fake);

    Route::get('/_bad', function () {
        debugd()->info('bad bytes', ['x' => "\xB1\x31\x32"]); // invalid UTF-8
        return 'ok';
    });

    $this->get('/_bad')->assertOk();
    expect($fake->sent)->toHaveCount(1);

    // and the body the Sender would actually POST must be valid JSON
    $body = json_encode($fake->sent[0], JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR);
    expect($body)->not->toBeFalse();
});

it('repro: huge context is capped under 512KB', function () {
    $c = new \Debugd\Collector();
    $c->addLog(['level' => 'info', 'message' => 'big', 'context' => ['blob' => str_repeat('x', 800 * 1024)], 'offset_ms' => 1.0]);
    $env = $c->toEnvelope('t', 'app', ['method' => 'GET', 'path' => '/', 'route' => '', 'status' => 200, 'duration_ms' => 1.0, 'started_at' => 'now']);
    expect(strlen((string) json_encode($env)))->toBeLessThanOrEqual(512 * 1024);
});

<?php

declare(strict_types=1);

use Debugd\Contracts\Sender;
use Debugd\Tests\Support\FakeSender;
use Illuminate\Support\Facades\Route;

it('records dumps and benchmarks into the trace', function () {
    $fake = new FakeSender();
    $this->app->instance(Sender::class, $fake);

    Route::get('/_dbg', function () {
        debugd('hello world');                       // 1 dump
        debugd(['a' => 1, 'b' => 2]);                // 1 dump (array)
        debugd()->dump(['nested' => ['x' => 1]], 'state'); // 1 labeled dump
        $result = debugd()->bench('heavy work', fn () => 21 * 2);
        expect($result)->toBe(42); // bench returns the closure's result
        return 'ok';
    });

    $this->get('/_dbg')->assertOk();
    $env = $fake->sent[0];

    expect($env['dumps'])->toHaveCount(3)
        ->and($env['dumps'][0]['value'])->toContain('hello world')
        ->and($env['dumps'][0]['type'])->toBe('string')
        ->and($env['dumps'][1]['type'])->toBe('array')
        ->and($env['dumps'][2]['label'])->toBe('state')
        ->and($env['dumps'][2]['value'])->toContain('nested')
        ->and($env['dumps'][0])->toHaveKeys(['caller', 'offset_ms']);

    expect($env['measures'])->toHaveCount(1)
        ->and($env['measures'][0]['label'])->toBe('heavy work')
        ->and($env['measures'][0]['duration_ms'])->toBeGreaterThanOrEqual(0.0);
});

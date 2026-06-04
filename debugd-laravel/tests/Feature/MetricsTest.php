<?php

declare(strict_types=1);

use Debugd\Contracts\Sender;
use Debugd\Tests\Support\FakeSender;
use Illuminate\Support\Facades\Route;

it('captures boot time, peak memory and total duration on the request', function () {
    $fake = new FakeSender();
    $this->app->instance(Sender::class, $fake);

    Route::get('/_metrics', fn () => 'ok');

    $this->get('/_metrics')->assertOk();

    $r = $fake->sent[0]['request'];
    expect($r)->toHaveKeys(['duration_ms', 'boot_ms', 'memory_mb'])
        ->and($r['memory_mb'])->toBeGreaterThan(0.0)
        ->and($r['boot_ms'])->toBeGreaterThanOrEqual(0.0)
        ->and($r['duration_ms'])->toBeGreaterThanOrEqual(0.0);

    $o = $fake->sent[0]['octane'];
    expect($o)->toHaveKeys(['running', 'runtime', 'worker_pid', 'worker_requests', 'worker_memory_start_mb', 'memory_growth_mb', 'bindings', 'new_bindings'])
        ->and($o['running'])->toBeFalse() // tests run under CLI, not Octane
        ->and($o['runtime'])->toBeString()
        ->and($o['worker_pid'])->toBeGreaterThan(0)
        ->and($o['worker_requests'])->toBeGreaterThanOrEqual(1)
        ->and($o['bindings'])->toBeGreaterThan(0)
        ->and($o['new_bindings'])->toBeArray();
});

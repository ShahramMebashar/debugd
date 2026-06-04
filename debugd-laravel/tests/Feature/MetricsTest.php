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
});

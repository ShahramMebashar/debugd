<?php

declare(strict_types=1);

use Debugd\Contracts\Sender;
use Debugd\Tests\Support\FakeSender;
use Illuminate\Support\Facades\Route;

it('ships exactly one envelope per request through the sender', function () {
    $fake = new FakeSender();
    $this->app->instance(Sender::class, $fake);

    Route::get('/_probe', fn () => 'ok');

    $this->get('/_probe')->assertOk();

    expect($fake->sent)->toHaveCount(1);

    $env = $fake->sent[0];
    expect($env['project_root'])->toBe(base_path());
    expect($env['v'])->toBe(1)
        ->and($env['request']['method'])->toBe('GET')
        ->and($env['request']['path'])->toBe('/_probe')
        ->and($env['request']['status'])->toBe(200)
        ->and($env['trace_id'])->not->toBeEmpty();
});

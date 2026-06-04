<?php

declare(strict_types=1);

use Debugd\Contracts\Sender;
use Debugd\Tests\Support\FakeSender;
use Illuminate\Support\Facades\Route;

it('ships nothing when DEBUGD_HOST is unset', function () {
    $fake = new FakeSender();
    $this->app->instance(Sender::class, $fake);

    Route::get('/_probe', fn () => 'ok');

    $this->get('/_probe')->assertOk();

    expect($fake->sent)->toBeEmpty();
});

it('registers no global trace middleware when disabled', function () {
    $kernel = $this->app->make(Illuminate\Contracts\Http\Kernel::class);

    expect($kernel->hasMiddleware(Debugd\Http\TraceMiddleware::class))->toBeFalse();
});

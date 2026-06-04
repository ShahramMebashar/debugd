<?php

declare(strict_types=1);

use Debugd\Contracts\Sender;
use Debugd\Tests\Support\FakeSender;
use Illuminate\Support\Facades\Route;

it('captures a reported exception into the envelope', function () {
    $fake = new FakeSender();
    $this->app->instance(Sender::class, $fake);

    Route::get('/_boom', function () {
        throw new RuntimeException('kaboom');
    });

    $this->get('/_boom'); // handled → 500, exception reported

    expect($fake->sent)->toHaveCount(1);

    $exc = $fake->sent[0]['exception'];
    expect($exc)->not->toBeNull()
        ->and($exc['class'])->toBe(RuntimeException::class)
        ->and($exc['message'])->toBe('kaboom')
        ->and($exc['file'])->toContain('ExceptionTest.php:');
});

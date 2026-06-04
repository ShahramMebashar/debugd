<?php

declare(strict_types=1);

use Debugd\Contracts\Sender;
use Debugd\Tests\Support\FakeSender;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;

it('captures log records with level, message and context', function () {
    $fake = new FakeSender();
    $this->app->instance(Sender::class, $fake);

    Route::get('/_log', function () {
        Log::warning('careful', ['id' => 5]);
        return 'ok';
    });

    $this->get('/_log')->assertOk();

    $logs = collect($fake->sent[0]['logs']);
    $entry = $logs->firstWhere('message', 'careful');

    expect($entry)->not->toBeNull()
        ->and($entry['level'])->toBe('warning')
        ->and($entry['context'])->toBe(['id' => 5])
        ->and($entry)->toHaveKey('offset_ms');
});

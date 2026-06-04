<?php

declare(strict_types=1);

use Debugd\Contracts\Sender;
use Debugd\Tests\Support\FakeSender;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

it('captures queries with a non-vendor caller and bindings count only', function () {
    $fake = new FakeSender();
    $this->app->instance(Sender::class, $fake);

    Route::get('/_query', function () {
        DB::select('select ? as n', [7]);
        return 'ok';
    });

    $this->get('/_query')->assertOk();

    $queries = $fake->sent[0]['queries'];
    expect($queries)->toHaveCount(1);

    $q = $queries[0];
    expect($q['bindings_count'])->toBe(1)
        ->and($q)->not->toHaveKey('bindings')      // raw bindings never shipped by default
        ->and($q['connection'])->toBe('testing')
        ->and($q['caller'])->toContain('QueryCaptureTest.php:') // first non-vendor frame
        ->and($q['caller'])->not->toContain('vendor');
});

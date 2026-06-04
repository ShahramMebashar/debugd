<?php

declare(strict_types=1);

use Debugd\Contracts\Sender;
use Debugd\Tests\Support\FakeSender;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

it('ships raw bindings only when DEBUGD_CAPTURE_BINDINGS is enabled', function () {
    // The flag is set before boot by BindingsTestCase (read once at boot).
    $fake = new FakeSender();
    $this->app->instance(Sender::class, $fake);

    Route::get('/_bindings', function () {
        DB::select('select ? as n, ? as m', [7, 'x']);
        return 'ok';
    });

    $this->get('/_bindings')->assertOk();

    $q = $fake->sent[0]['queries'][0];
    expect($q['bindings_count'])->toBe(2)
        ->and($q['bindings'])->toBe([7, 'x']);
});

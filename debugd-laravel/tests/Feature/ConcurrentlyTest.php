<?php

declare(strict_types=1);

use Debugd\Contracts\Sender;
use Debugd\Tests\Support\FakeSender;
use Illuminate\Support\Facades\Route;

it('runs tasks, returns keyed results, and records each as a grouped span', function () {
    $fake = new FakeSender();
    $this->app->instance(Sender::class, $fake);

    Route::get('/_conc', function () {
        $results = debugd()->concurrently([
            'sum' => fn () => 1 + 1,
            'name' => fn () => 'octane',
        ]);
        // results come back keyed exactly like the input
        expect($results)->toBe(['sum' => 2, 'name' => 'octane']);
        return 'ok';
    });

    $this->get('/_conc')->assertOk();

    $spans = collect($fake->sent[0]['measures'])->where('group', '!=', '')->values();
    expect($spans)->toHaveCount(2)
        ->and($spans[0]['label'])->toBe('sum')
        ->and($spans[1]['label'])->toBe('name')
        ->and($spans[0]['group'])->toBe($spans[1]['group'])      // same batch
        ->and($spans[0]['concurrent'])->toBeFalse()             // sequential fallback (no Octane in tests)
        ->and($spans[0])->toHaveKeys(['duration_ms', 'caller', 'offset_ms']);
});

it('still runs the tasks when tracing produces no span (bench-style safety)', function () {
    $fake = new FakeSender();
    $this->app->instance(Sender::class, $fake);

    Route::get('/_conc2', function () {
        return response()->json(debugd()->concurrently(['x' => fn () => 41 + 1]));
    });

    $this->get('/_conc2')->assertOk()->assertJson(['x' => 42]);
});

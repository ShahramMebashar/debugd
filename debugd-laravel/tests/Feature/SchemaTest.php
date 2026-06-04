<?php

declare(strict_types=1);

use Debugd\Contracts\Sender;
use Debugd\Tests\Support\FakeSender;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;
use Opis\JsonSchema\Validator;
use Opis\JsonSchema\Errors\ErrorFormatter;

it('emits a payload that validates against the frozen wire schema', function () {
    $fake = new FakeSender();
    $this->app->instance(Sender::class, $fake);

    Route::get('/_full', function () {
        DB::select('select ? as n', [1]);
        Log::info('hello', ['k' => 'v']);
        return response('ok', 200);
    });

    $this->get('/_full')->assertOk();

    // Round-trip through JSON exactly as the wire would (objects, not assoc edge cases).
    $payload = json_decode((string) json_encode($fake->sent[0]));

    $schemaPath = realpath(__DIR__ . '/../../../schema/trace.schema.json');
    expect($schemaPath)->not->toBeFalse('schema/trace.schema.json must exist at repo root');

    $validator = new Validator();
    $validator->resolver()->registerFile(
        'https://debugd.dev/schema/trace.schema.json',
        $schemaPath,
    );
    $result = $validator->validate($payload, 'https://debugd.dev/schema/trace.schema.json');

    $errors = $result->isValid() ? [] : (new ErrorFormatter())->format($result->error());
    expect($result->isValid())->toBeTrue(json_encode($errors, JSON_PRETTY_PRINT));
});

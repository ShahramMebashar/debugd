<?php

declare(strict_types=1);

it('is a safe no-op when DEBUGD_HOST is unset, but bench still runs', function () {
    // No exception, and bench returns the closure result even while disabled.
    debugd('ignored');
    $result = debugd()->bench('still runs', fn () => 10 + 5);

    expect($result)->toBe(15);
});

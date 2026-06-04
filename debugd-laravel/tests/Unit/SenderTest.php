<?php

declare(strict_types=1);

use Debugd\Transport\Sender;

it('never throws when the debugd server is unreachable', function () {
    // Port 1 refuses instantly; tight timeouts keep this fast.
    $sender = new Sender('http://127.0.0.1:1');

    $sender->send(['v' => 1, 'trace_id' => 't']);

    expect(true)->toBeTrue(); // reaching here means no exception escaped
});

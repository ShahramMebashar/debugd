<?php

declare(strict_types=1);

namespace Debugd\Tests\Support;

use Debugd\Contracts\Sender;

/** Captures envelopes in memory so tests can assert what would be shipped. */
final class FakeSender implements Sender
{
    /** @var array<int, array<string, mixed>> */
    public array $sent = [];

    public function send(array $envelope): void
    {
        $this->sent[] = $envelope;
    }
}

<?php

declare(strict_types=1);

namespace Debugd\Contracts;

/**
 * The network boundary, abstracted so the capture path can be tested without
 * a real server. Implementations MUST never throw — tracing cannot affect the app.
 */
interface Sender
{
    /** @param array<string, mixed> $envelope Wire protocol v1 envelope. */
    public function send(array $envelope): void;
}

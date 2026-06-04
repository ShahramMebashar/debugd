<?php

declare(strict_types=1);

namespace Debugd;

/**
 * Per-request timing anchor. requestStart is the true SAPI request start
 * (before framework boot); bootedAt is stamped when the app finishes booting,
 * so bootMs() is the framework boot cost. Request-scoped, so Octane workers
 * (boot once, reused) naturally report ~0 boot on subsequent requests.
 */
final class Timing
{
    public ?float $bootedAt = null;

    public function __construct(public readonly float $requestStart) {}

    public function bootMs(): float
    {
        if ($this->bootedAt === null) {
            return 0.0;
        }
        return round(max(0.0, ($this->bootedAt - $this->requestStart) * 1000), 1);
    }
}

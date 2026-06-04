<?php

declare(strict_types=1);

namespace Debugd\Tests;

/** Boots the package with DEBUGD_HOST unset — the "inert" state (§4). */
abstract class InertTestCase extends TestCase
{
    protected function defineEnvironment($app): void
    {
        $this->setDebugdHost('');
    }
}

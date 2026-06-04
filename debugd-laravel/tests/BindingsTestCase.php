<?php

declare(strict_types=1);

namespace Debugd\Tests;

/** Boots the package with DEBUGD_CAPTURE_BINDINGS enabled — set before boot,
 *  as it would be in a real app's .env (the flag is read once at boot). */
abstract class BindingsTestCase extends TestCase
{
    protected function defineEnvironment($app): void
    {
        parent::defineEnvironment($app);
        putenv('DEBUGD_CAPTURE_BINDINGS=true');
    }
}

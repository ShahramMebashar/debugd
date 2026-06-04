<?php

declare(strict_types=1);

namespace Debugd\Tests;

use Debugd\DebugdServiceProvider;
use Orchestra\Testbench\TestCase as Orchestra;

abstract class TestCase extends Orchestra
{
    protected function getPackageProviders($app): array
    {
        return [DebugdServiceProvider::class];
    }

    /** Boot the package "enabled" by default; inert-mode tests unset this. */
    protected function defineEnvironment($app): void
    {
        $this->setDebugdHost('http://127.0.0.1:9100');
        putenv('DEBUGD_CAPTURE_BINDINGS'); // off by default; isolate from prior tests

        $app['config']->set('database.default', 'testing');
        $app['config']->set('database.connections.testing', [
            'driver' => 'sqlite',
            'database' => ':memory:',
            'prefix' => '',
        ]);
    }

    protected function setDebugdHost(string $host): void
    {
        putenv($host === '' ? 'DEBUGD_HOST' : "DEBUGD_HOST={$host}");
        $_ENV['DEBUGD_HOST'] = $host;
        $_SERVER['DEBUGD_HOST'] = $host;
    }
}

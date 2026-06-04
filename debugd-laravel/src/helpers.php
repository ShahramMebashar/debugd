<?php

declare(strict_types=1);

use Debugd\Collector;
use Debugd\Recorder;

if (! function_exists('debugd')) {
    /**
     * Global debug helper.
     *   debugd($value);                  // dump a value into the current trace
     *   debugd($a, $b);                  // dump several
     *   debugd()->dump($v, 'label');     // labeled dump
     *   debugd()->bench('work', fn() => …); // time a closure, returns its result
     *   debugd()->info('message', [...]);   // structured log
     *
     * Inert (no-op, but bench still runs) when DEBUGD_HOST is unset.
     */
    function debugd(mixed ...$values): Recorder
    {
        $app = function_exists('app') ? app() : null;
        $collector = ($app && $app->bound('debugd.recording') && $app->bound(Collector::class))
            ? $app->make(Collector::class)
            : null;

        $recorder = new Recorder($collector);
        foreach ($values as $value) {
            $recorder->dump($value);
        }
        return $recorder;
    }
}

<?php

declare(strict_types=1);

namespace Debugd\Logging;

use Debugd\Collector;
use Illuminate\Contracts\Foundation\Application;
use Monolog\Handler\AbstractProcessingHandler;
use Monolog\Level;
use Monolog\LogRecord;

/**
 * Monolog handler appended to the stack: mirrors every log record into the
 * per-request Collector. Resolves the Collector lazily so it always reads the
 * current request's scoped instance (Octane-safe).
 */
final class DebugdHandler extends AbstractProcessingHandler
{
    public function __construct(private readonly Application $app, Level|int|string $level = Level::Debug)
    {
        parent::__construct($level);
    }

    protected function write(LogRecord $record): void
    {
        /** @var Collector $c */
        $c = $this->app->make(Collector::class);
        $c->addLog([
            'level' => strtolower($record->level->getName()),
            'message' => $record->message,
            'context' => $record->context,
            'offset_ms' => $c->offsetMs(),
        ]);
    }
}

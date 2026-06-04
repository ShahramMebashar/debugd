<?php

declare(strict_types=1);

namespace Debugd\Logging;

use Debugd\Collector;
use Monolog\Handler\AbstractProcessingHandler;
use Monolog\Level;
use Monolog\LogRecord;

/**
 * Monolog handler appended to the stack: mirrors every log record into the
 * per-request Collector. Resolves via app() so it always hits the CURRENT
 * request's Collector — under Octane that's a per-request sandbox clone, not
 * the base app captured at boot.
 */
final class DebugdHandler extends AbstractProcessingHandler
{
    public function __construct(Level|int|string $level = Level::Debug)
    {
        parent::__construct($level);
    }

    protected function write(LogRecord $record): void
    {
        /** @var Collector $c */
        $c = app(Collector::class);
        $c->addLog([
            'level' => strtolower($record->level->getName()),
            'message' => $record->message,
            'context' => $record->context,
            'offset_ms' => $c->offsetMs(),
        ]);
    }
}

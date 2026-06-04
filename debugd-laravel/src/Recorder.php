<?php

declare(strict_types=1);

namespace Debugd;

use Closure;
use Debugd\Support\Caller;
use Debugd\Support\Value;

/**
 * The object returned by the global debugd() helper. When tracing is off the
 * Collector is null and every method is a safe no-op (bench still runs its
 * closure), so debugd() calls can be left in code with ~zero production cost.
 */
final class Recorder
{
    public function __construct(private readonly ?Collector $collector) {}

    /** Record a value dump (string, array, object, scalar). Chainable. */
    public function dump(mixed $value, ?string $label = null): self
    {
        $this->collector?->addDump([
            'label' => $label,
            'type' => Value::typeOf($value),
            'value' => Value::stringify($value),
            'caller' => Caller::resolve(),
            'offset_ms' => $this->collector->offsetMs(),
        ]);
        return $this;
    }

    /**
     * Time a closure, record the measurement, and return its result.
     * Runs the closure even when tracing is off.
     *
     * @template T
     * @param  Closure():T  $callback
     * @return T
     */
    public function bench(string $label, Closure $callback): mixed
    {
        $start = microtime(true);
        try {
            return $callback();
        } finally {
            $this->span($label, round((microtime(true) - $start) * 1000, 3), $this->collector?->offsetMs() ?? 0.0, '', false);
        }
    }

    /**
     * Run tasks in parallel (via Octane when we're actually running under it,
     * otherwise sequentially) and return their results keyed exactly like the
     * input. Each task is recorded as a span grouped under one batch.
     *
     * Correctness first: the sequential path always produces the right results;
     * the Octane path is only used when $_SERVER['LARAVEL_OCTANE'] confirms the
     * worker is live, so it can never half-run or fail a normal request.
     *
     * @param  array<string, Closure>  $tasks
     * @return array<string, mixed>
     */
    public function concurrently(array $tasks): array
    {
        $group = $this->collector?->nextGroup() ?? '';
        $caller = Caller::resolve();
        $offset = $this->collector?->offsetMs() ?? 0.0;

        return $this->octaneRunning()
            ? $this->concurrentlyViaOctane($tasks, $group, $caller, $offset)
            : $this->concurrentlySequential($tasks, $group, $caller, $offset);
    }

    private function octaneRunning(): bool
    {
        return ! empty($_SERVER['LARAVEL_OCTANE'])
            && class_exists(\Laravel\Octane\Facades\Octane::class);
    }

    /** @param array<string, Closure> $tasks @return array<string, mixed> */
    private function concurrentlySequential(array $tasks, string $group, string $caller, float $offset): array
    {
        $results = [];
        foreach ($tasks as $key => $task) {
            $at = $this->collector?->offsetMs() ?? $offset;
            $start = microtime(true);
            $results[$key] = $task();
            $this->span((string) $key, round((microtime(true) - $start) * 1000, 3), $at, $group, false, $caller);
        }
        return $results;
    }

    /** @param array<string, Closure> $tasks @return array<string, mixed> */
    private function concurrentlyViaOctane(array $tasks, string $group, string $caller, float $offset): array
    {
        // Tasks run in child processes, so each self-times and returns its
        // duration alongside its result; the parent records the spans.
        $wrapped = [];
        foreach ($tasks as $key => $task) {
            $wrapped[$key] = static function () use ($task) {
                $start = microtime(true);
                $result = $task();
                return ['ms' => round((microtime(true) - $start) * 1000, 3), 'result' => $result];
            };
        }

        $raw = \Laravel\Octane\Facades\Octane::concurrently($wrapped);

        $results = [];
        foreach ($raw as $key => $payload) {
            $this->span((string) $key, (float) $payload['ms'], $offset, $group, true, $caller);
            $results[$key] = $payload['result'];
        }
        return $results;
    }

    private function span(string $label, float $durationMs, float $offsetMs, string $group, bool $concurrent, ?string $caller = null): void
    {
        $this->collector?->addMeasure([
            'label' => $label,
            'duration_ms' => $durationMs,
            'caller' => $caller ?? Caller::resolve(),
            'offset_ms' => $offsetMs,
            'concurrent' => $concurrent,
            'group' => $group,
        ]);
    }

    public function info(string $message, array $context = []): self
    {
        return $this->logAt('info', $message, $context);
    }

    public function warning(string $message, array $context = []): self
    {
        return $this->logAt('warning', $message, $context);
    }

    private function logAt(string $level, string $message, array $context): self
    {
        $this->collector?->addLog([
            'level' => $level,
            'message' => $message,
            'context' => $context,
            'offset_ms' => $this->collector->offsetMs(),
        ]);
        return $this;
    }
}

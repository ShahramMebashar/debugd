<?php

declare(strict_types=1);

namespace Debugd;

/**
 * Worker-persistent state — a TRUE singleton (not request-scoped), so under
 * Octane it survives across the requests a worker handles. That persistence is
 * exactly what lets us measure per-worker request count and memory growth (the
 * #1 Octane leak signal). Under php-fpm each process is fresh, so requests is
 * always 1 and growth is 0 — which is correct (fpm can't leak across requests).
 */
final class WorkerState
{
    public readonly int $pid;
    public int $requests = 0;
    public ?float $baselineMemoryMb = null;
    public float $peakMemoryMb = 0.0;

    public int $bindingBaseline = 0;
    /** @var array<string, true> Every container binding key seen so far. */
    private array $seenBindings = [];

    public function __construct()
    {
        $this->pid = (int) getmypid();
    }

    /** Record one finished request's peak memory (MB). */
    public function record(float $memoryMb): void
    {
        $this->requests++;
        $this->baselineMemoryMb ??= $memoryMb;
        $this->peakMemoryMb = max($this->peakMemoryMb, $memoryMb);
    }

    /** Memory grown since this worker's first request — the leak signal. */
    public function growthMb(float $currentMb): float
    {
        return round($currentMb - ($this->baselineMemoryMb ?? $currentMb), 1);
    }

    /**
     * Record the current container binding keys and return the ones seen for
     * the FIRST time after the baseline request. A binding is reported at most
     * once ever, so deferred-provider warmup flags each service a single time
     * (and plateaus), while a real per-request binding leak keeps producing new
     * keys every request — that recurrence is the signal.
     *
     * @param  array<int, string>  $currentKeys
     * @return array<int, string>  newly-seen keys (empty on the baseline request)
     */
    public function recordBindings(array $currentKeys): array
    {
        $isBaseline = $this->seenBindings === [];
        $new = [];
        foreach ($currentKeys as $key) {
            if (! isset($this->seenBindings[$key])) {
                $this->seenBindings[$key] = true;
                if (! $isBaseline) {
                    $new[] = $key;
                }
            }
        }
        if ($isBaseline) {
            $this->bindingBaseline = count($currentKeys);
        }
        return $new;
    }
}

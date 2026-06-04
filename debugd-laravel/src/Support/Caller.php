<?php

declare(strict_types=1);

namespace Debugd\Support;

/**
 * Resolves the first *application* stack frame as `relative/path.php:line`.
 * Skips vendor frames and debugd's own src/ frames so callers point at the
 * user's code, not the package internals. Shared by the query collector and
 * the debugd() recorder.
 */
final class Caller
{
    public static function resolve(int $limit = 30): string
    {
        $base = self::basePath() . DIRECTORY_SEPARATOR;
        $ownSrc = dirname(__DIR__) . DIRECTORY_SEPARATOR; // package src/ root

        foreach (debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, $limit) as $frame) {
            $file = $frame['file'] ?? '';
            if ($file === ''
                || str_starts_with($file, $ownSrc)
                || str_contains($file, DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR)) {
                continue;
            }
            return str_replace($base, '', $file) . ':' . ($frame['line'] ?? 0);
        }
        return 'unknown';
    }

    private static function basePath(): string
    {
        return function_exists('base_path') ? base_path() : getcwd();
    }
}

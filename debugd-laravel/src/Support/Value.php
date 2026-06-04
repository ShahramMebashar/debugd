<?php

declare(strict_types=1);

namespace Debugd\Support;

/** Serializes arbitrary dumped values to a bounded, readable string. */
final class Value
{
    private const MAX = 8192; // per-dump cap so a big object can't blow the payload

    public static function typeOf(mixed $v): string
    {
        return is_object($v) ? $v::class : gettype($v);
    }

    public static function stringify(mixed $v): string
    {
        if (is_string($v)) {
            $s = $v;
        } elseif (is_scalar($v) || $v === null) {
            $s = var_export($v, true);
        } else {
            $json = json_encode(
                $v,
                JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
                    | JSON_PARTIAL_OUTPUT_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE,
            );
            $s = ($json !== false && $json !== '{}' && $json !== 'null') ? $json : print_r($v, true);
        }

        if (strlen($s) > self::MAX) {
            $s = substr($s, 0, self::MAX) . "\n… (truncated)";
        }
        return $s;
    }
}

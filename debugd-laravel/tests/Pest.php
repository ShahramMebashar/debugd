<?php

declare(strict_types=1);

use Debugd\Tests\BindingsTestCase;
use Debugd\Tests\InertTestCase;
use Debugd\Tests\TestCase;

uses(TestCase::class)->in('Unit', 'Feature');
uses(InertTestCase::class)->in('Inert');       // booted with DEBUGD_HOST unset
uses(BindingsTestCase::class)->in('Bindings'); // booted with DEBUGD_CAPTURE_BINDINGS=true

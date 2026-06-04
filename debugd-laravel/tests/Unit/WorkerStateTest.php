<?php

declare(strict_types=1);

use Debugd\WorkerState;

it('treats the first request as the baseline and reports nothing new', function () {
    $w = new WorkerState();

    expect($w->recordBindings(['router', 'db', 'cache']))->toBe([]);
    expect($w->bindingBaseline)->toBe(3);
});

it('reports only genuinely-new bindings, and each only once', function () {
    $w = new WorkerState();
    $w->recordBindings(['router', 'db']); // baseline

    // a deferred service warms up once → reported once, then never again
    expect($w->recordBindings(['router', 'db', 'mailer']))->toBe(['mailer']);
    expect($w->recordBindings(['router', 'db', 'mailer']))->toBe([]);

    // a leak keeps registering fresh keys every request
    expect($w->recordBindings(['router', 'db', 'mailer', 'leak.1']))->toBe(['leak.1']);
    expect($w->recordBindings(['router', 'db', 'mailer', 'leak.1', 'leak.2']))->toBe(['leak.2']);
});

<?php

namespace Modules\Communications\Http\Controllers\Api;

use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Modules\Communications\Services\Monitoring\ExceptionTelegramReporter;

class FrontendErrorController
{
    public function __invoke(Request $request, ExceptionTelegramReporter $reporter): Response
    {
        if (! in_array($request->server('REMOTE_ADDR'), ['127.0.0.1', '::1'], true)) {
            abort(403);
        }

        /** @var array<string, string|null> $payload */
        $payload = $request->validate([
            'digest' => ['nullable', 'string', 'max:128'],
            'path' => ['required', 'string', 'max:512'],
            'method' => ['required', 'string', 'max:16'],
            'routerKind' => ['nullable', 'string', 'max:64'],
            'routePath' => ['nullable', 'string', 'max:512'],
            'routeType' => ['nullable', 'string', 'max:64'],
            'name' => ['required', 'string', 'max:160'],
            'message' => ['required', 'string', 'max:1000'],
        ]);

        $reporter->reportFrontend($payload);

        return response()->noContent();
    }
}

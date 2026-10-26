<?php

use App\Http\Middleware\EnsureClient;
use App\Http\Middleware\IsAdmin;
use App\Http\Middleware\IsAdminOrManager;
use App\Http\Middleware\LegacyOpenCartRedirect;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Modules\Communications\Services\Monitoring\ExceptionTelegramReporter;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withBroadcasting(
        channels: __DIR__.'/../routes/channels.php',
        attributes: ['prefix' => 'api', 'middleware' => ['api', 'auth:sanctum']],
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'ensure_client' => EnsureClient::class,
            'is_admin' => IsAdmin::class,
            'is_admin_or_manager' => IsAdminOrManager::class,
        ]);
        // API has no named login route. A guest request without Accept: application/json
        // otherwise calls route('login') and throws RouteNotFoundException.
        $middleware->redirectGuestsTo(function (Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return null;
            }

            return '/';
        });
        // OpenCart /index.php?route=… hits PHP (nginx), not Next — resolve seo_redirects here.
        $middleware->prepend(LegacyOpenCartRedirect::class);
        // seo-redirects/resolve: trailing spaces in legacy from_path are meaningful.
        $middleware->trimStrings(except: [
            'path',
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->report(function (\Throwable $exception): void {
            app(ExceptionTelegramReporter::class)->report(
                $exception,
                app()->runningInConsole() ? null : request(),
            );
        });

        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json([
                    'message' => 'Unauthenticated.',
                ], 401);
            }

            return null;
        });
    })->create();

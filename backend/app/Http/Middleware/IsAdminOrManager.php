<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Modules\Users\Enums\Role;
use Modules\Users\Models\User;
use Symfony\Component\HttpFoundation\Response;

class IsAdminOrManager
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$user instanceof User) {
            abort(403, 'Доступ запрещен');
        }

        if (!$user->hasAnyRole([Role::ADMIN, Role::MANAGER])) {
            abort(403, 'Доступ запрещен');
        }

        return $next($request);
    }
}

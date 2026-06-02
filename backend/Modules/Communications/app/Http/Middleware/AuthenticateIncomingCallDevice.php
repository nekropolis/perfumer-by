<?php

namespace Modules\Communications\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Modules\Communications\Models\IncomingCallDevice;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateIncomingCallDevice
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $token = $user?->currentAccessToken();

        if ($token === null || ! in_array('incoming-call:send-to-crm', $token->abilities ?? [], true)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $device = IncomingCallDevice::query()
            ->where('personal_access_token_id', $token->id)
            ->where('is_active', true)
            ->first();

        if ($device === null) {
            return response()->json(['message' => 'Device not found or inactive.'], 403);
        }

        $request->attributes->set('incoming_call_device', $device);

        return $next($request);
    }
}

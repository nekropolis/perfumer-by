<?php

namespace Modules\Users\Support;

use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Modules\Users\Models\User;

final class SanctumActor
{
    public static function isStaff(Request $request): bool
    {
        $plain = $request->bearerToken();
        if ($plain === null || $plain === '') {
            return false;
        }

        $access = PersonalAccessToken::findToken($plain);
        if ($access === null) {
            return false;
        }

        return $access->tokenable instanceof User
            || $access->tokenable_type === User::class;
    }
}

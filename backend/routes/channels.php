<?php

use Illuminate\Support\Facades\Broadcast;
use Modules\Users\Models\User;

Broadcast::channel('manager.{managerId}.incoming-calls', function (User $user, int $managerId): bool {
    if ((int) $user->id !== $managerId) {
        return false;
    }

    return in_array((string) $user->role, ['admin', 'manager', 'ceo'], true);
});

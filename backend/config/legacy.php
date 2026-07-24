<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Legacy OpenCart access
    |--------------------------------------------------------------------------
    |
    | Prefer SSH when LEGACY_SSH_HOST is set: Laravel runs `mysql` on the
    | legacy host (localhost there). Direct PDO (database.connections.legacy)
    | is used only when SSH is not configured.
    |
    */

    'ssh' => [
        'host' => env('LEGACY_SSH_HOST', ''),
        'user' => env('LEGACY_SSH_USER', ''),
        'port' => (int) env('LEGACY_SSH_PORT', 22),
        /** Must be readable by php-fpm user (not /root/.ssh). */
        'private_key' => env('LEGACY_SSH_PRIVATE_KEY', ''),
        /** Shared known_hosts for CLI + web (default under storage). */
        'known_hosts' => env('LEGACY_SSH_KNOWN_HOSTS', storage_path('app/legacy_ssh/known_hosts')),
    ],

];

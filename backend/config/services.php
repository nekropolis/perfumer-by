<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'telegram' => [
        'bot_token' => env('TELEGRAM_BOT_TOKEN'),
        'chat_id' => env('TELEGRAM_CHAT_ID'),
    ],

    'veter' => [
        // Явный флаг расписания/API: на prod VETER=true, на staging/dev не задавать.
        'enabled' => filter_var(env('VETER', false), FILTER_VALIDATE_BOOLEAN),
        // Punycode for ветер.бел — Cyrillic host breaks on some servers.
        'base_url' => env('VETER_BASE_URL', 'https://xn--b1aga8bi.xn--90ais'),
        'user_id' => env('VETER_USER_ID'),
        'api_key' => env('VETER_API_KEY'),
        'timeout' => env('VETER_TIMEOUT', 60),
        'profile_name' => env('VETER_PROFILE_NAME', ''),
        /** ID профиля из селекта кабинета (SelectedProfileID / optionsValue). */
        'profile_id' => env('VETER_PROFILE_ID', ''),
        /** CityID Ветер для заказов minsk_courier (у них нет delivery_city_id). */
        'minsk_city_id' => env('VETER_MINSK_CITY_ID', ''),
        'sender' => [
            'city_id' => env('VETER_SENDER_CITY_ID', ''),
            'street_prefix' => env('VETER_SENDER_STREET_PREFIX', 'ул.'),
            'street_name' => env('VETER_SENDER_STREET_NAME', ''),
            'house_number' => env('VETER_SENDER_HOUSE_NUMBER', ''),
            'korpus' => env('VETER_SENDER_KORPUS', ''),
            'kvartira' => env('VETER_SENDER_KVARTIRA', ''),
        ],
    ],

    'catalog_search' => [
        'enabled' => env('CATALOG_SEARCH_ENABLED', false),
        'log_metrics' => env('CATALOG_SEARCH_LOG_METRICS', true),
        'async_updates' => env('CATALOG_SEARCH_ASYNC_UPDATES', true),
        'queue_name' => env('CATALOG_SEARCH_QUEUE_NAME', 'default'),
        'search_cache_ttl_seconds' => env('CATALOG_SEARCH_CACHE_TTL_SECONDS', 20),
        'response_cache_ttl_seconds' => env('CATALOG_SEARCH_RESPONSE_CACHE_TTL_SECONDS', 120),
        'meilisearch' => [
            'url' => env('CATALOG_SEARCH_MEILI_URL'),
            'api_key' => env('CATALOG_SEARCH_MEILI_KEY'),
            'index' => env('CATALOG_SEARCH_MEILI_INDEX', 'catalog_products'),
            'timeout_seconds' => env('CATALOG_SEARCH_MEILI_TIMEOUT_SECONDS', 2),
        ],
    ],

    'catalog_storefront' => [
        'revalidate_url' => env('CATALOG_STOREFRONT_REVALIDATE_URL'),
        'revalidate_secret' => env('CATALOG_STOREFRONT_REVALIDATE_SECRET'),
    ],

];

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

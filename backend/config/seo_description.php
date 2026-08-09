<?php

return [
    'url' => env('SEO_DESCRIPTION_URL', 'http://192.168.0.20/api'),
    'token' => env('SEO_DESCRIPTION_TOKEN'),
    'site' => env('SEO_DESCRIPTION_SITE', 'perfumer'),
    'connect_timeout' => (int) env('SEO_DESCRIPTION_CONNECT_TIMEOUT', 5),
    'request_timeout' => (int) env('SEO_DESCRIPTION_REQUEST_TIMEOUT', 20),
    'get_retries' => (int) env('SEO_DESCRIPTION_GET_RETRIES', 2),
    'retry_delay_ms' => (int) env('SEO_DESCRIPTION_RETRY_DELAY_MS', 250),
    'poll_interval' => (int) env('SEO_DESCRIPTION_POLL_INTERVAL', 5),
    'deadline' => (int) env('SEO_DESCRIPTION_DEADLINE', 600),
    'queue' => env('SEO_DESCRIPTION_QUEUE', 'default'),
    'work_chunk_size' => (int) env('SEO_DESCRIPTION_WORK_CHUNK_SIZE', 25),
    'ready_limit' => (int) env('SEO_DESCRIPTION_READY_LIMIT', 100),
    'ready_poll_minutes' => (int) env('SEO_DESCRIPTION_READY_POLL_MINUTES', 2),
];

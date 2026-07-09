<?php

return [
    'name' => 'Communications',

    'otp' => [
        'viber_first' => env('OTP_VIBER_FIRST', true),
    ],

    'viber' => [
        'enabled' => env('VIBER_OTP_ENABLED', true),
        'driver' => env('VIBER_OTP_DRIVER', 'mock'),
        'endpoint' => env('VIBER_OTP_ENDPOINT'),
        'token' => env('VIBER_OTP_TOKEN'),
        'sender' => env('VIBER_OTP_SENDER', 'Perfumer'),
        'timeout' => (int) env('VIBER_OTP_TIMEOUT', 5),
        'mock_registration_mode' => env('VIBER_MOCK_REGISTRATION_MODE', 'all'), // all|none|list
        'mock_registered_phones' => env('VIBER_MOCK_REGISTERED_PHONES', ''),
    ],

    'sms' => [
        'enabled' => env('SMS_OTP_ENABLED', true),
        'driver' => env('SMS_OTP_DRIVER', 'mock'),
        'endpoint' => env('SMS_OTP_ENDPOINT'),
        'token' => env('SMS_OTP_TOKEN'),
        'sender' => env('SMS_OTP_SENDER', 'Perfumer'),
        'timeout' => (int) env('SMS_OTP_TIMEOUT', 5),
    ],

    'telegram' => [
        'enabled' => env('TELEGRAM_NOTIFICATIONS_ENABLED', true),
        'bot_token' => env('TELEGRAM_BOT_TOKEN'),
        'chat_id' => env('TELEGRAM_CHAT_ID'),
        'timeout' => (int) env('TELEGRAM_TIMEOUT', 10),
    ],

    'server_monitor' => [
        'enabled' => env('SERVER_MONITOR_ENABLED', true),
        'log_tail_lines' => (int) env('SERVER_MONITOR_LOG_TAIL_LINES', 100),
        'mem_warn_mb' => (int) env('SERVER_MONITOR_MEM_WARN_MB', 250),
        'mem_critical_mb' => (int) env('SERVER_MONITOR_MEM_CRITICAL_MB', 120),
        'disk_warn_percent' => (int) env('SERVER_MONITOR_DISK_WARN_PERCENT', 85),
        'disk_critical_percent' => (int) env('SERVER_MONITOR_DISK_CRITICAL_PERCENT', 95),
        'queue_name' => env('SERVER_MONITOR_QUEUE_NAME', 'default'),
        'queue_warn_size' => (int) env('SERVER_MONITOR_QUEUE_WARN_SIZE', 100),
        'pm2_process' => env('SERVER_MONITOR_PM2_PROCESS', 'perfumer-frontend'),
        'pm2_user' => env('SERVER_MONITOR_PM2_USER', 'deploy'),
        'supervisor_program' => env('SERVER_MONITOR_SUPERVISOR_PROGRAM', 'perfumer-queue'),
        'supervisor_min_uptime_seconds' => (int) env('SERVER_MONITOR_SUPERVISOR_MIN_UPTIME_SECONDS', 120),
    ],
];

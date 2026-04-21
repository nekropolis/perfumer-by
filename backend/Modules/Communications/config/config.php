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
];

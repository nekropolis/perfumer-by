<?php

use Modules\Users\Models\Client;
use Modules\Users\Models\User;

return [

    /*
    |--------------------------------------------------------------------------
    | Authentication Defaults
    |--------------------------------------------------------------------------
    |
    | This option defines the default authentication "guard" and password
    | reset "broker" for your application. You may change these values
    | as required, but they're a perfect start for most applications.
    |
    */

    'defaults' => [
        'guard' => env('AUTH_GUARD', 'web'),
        'passwords' => env('AUTH_PASSWORD_BROKER', 'users'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Authentication Guards
    |--------------------------------------------------------------------------
    |
    | Next, you may define every authentication guard for your application.
    | Of course, a great default configuration has been defined for you
    | which utilizes session storage plus the Eloquent user provider.
    |
    | All authentication guards have a user provider, which defines how the
    | users are actually retrieved out of your database or other storage
    | system used by the application. Typically, Eloquent is utilized.
    |
    | Supported: "session"
    |
    */

    'guards' => [
        'web' => [
            'driver' => 'session',
            'provider' => 'users',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | User Providers
    |--------------------------------------------------------------------------
    |
    | All authentication guards have a user provider, which defines how the
    | users are actually retrieved out of your database or other storage
    | system used by the application. Typically, Eloquent is utilized.
    |
    | If you have multiple user tables or models you may configure multiple
    | providers to represent the model / table. These providers may then
    | be assigned to any extra authentication guards you have defined.
    |
    | Supported: "database", "eloquent"
    |
    */

    'providers' => [
        'users' => [
            'driver' => 'eloquent',
            'model' => env('AUTH_MODEL', User::class),
        ],

        'clients' => [
            'driver' => 'eloquent',
            'model' => Client::class,
        ],

        // 'users' => [
        //     'driver' => 'database',
        //     'table' => 'users',
        // ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Resetting Passwords
    |--------------------------------------------------------------------------
    |
    | These configuration options specify the behavior of Laravel's password
    | reset functionality, including the table utilized for token storage
    | and the user provider that is invoked to actually retrieve users.
    |
    | The expiry time is the number of minutes that each reset token will be
    | considered valid. This security feature keeps tokens short-lived so
    | they have less time to be guessed. You may change this as needed.
    |
    | The throttle setting is the number of seconds a user must wait before
    | generating more password reset tokens. This prevents the user from
    | quickly generating a very large amount of password reset tokens.
    |
    */

    'passwords' => [
        'users' => [
            'provider' => 'users',
            'table' => env('AUTH_PASSWORD_RESET_TOKEN_TABLE', 'password_reset_tokens'),
            'expire' => 60,
            'throttle' => 60,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Password Confirmation Timeout
    |--------------------------------------------------------------------------
    |
    | Here you may define the number of seconds before a password confirmation
    | window expires and users are asked to re-enter their password via the
    | confirmation screen. By default, the timeout lasts for three hours.
    |
    */

    'password_timeout' => env('AUTH_PASSWORD_TIMEOUT', 10800),

    /*
    |--------------------------------------------------------------------------
    | OTP / login anti-spam (phone auth)
    |--------------------------------------------------------------------------
    |
    | Do not call env() for these outside this file when using config:cache.
    |
    */

    'otp' => [
        'resend_cooldown_seconds' => (int) env('AUTH_OTP_RESEND_COOLDOWN_SECONDS', 60),
        'phone_limit_15m' => (int) env('AUTH_OTP_PHONE_LIMIT_15M', 3),
        'phone_limit_day' => (int) env('AUTH_OTP_PHONE_LIMIT_DAY', 8),
        'ip_limit_15m' => (int) env('AUTH_OTP_IP_LIMIT_15M', 10),
        'ip_phone_limit_15m' => (int) env('AUTH_OTP_IP_PHONE_LIMIT_15M', 3),
        'verify_max_attempts' => (int) env('AUTH_OTP_VERIFY_MAX_ATTEMPTS', 5),
        'verify_block_seconds' => (int) env('AUTH_OTP_VERIFY_BLOCK_SECONDS', 1800),
        'captcha_enabled' => filter_var(env('AUTH_OTP_CAPTCHA_ENABLED', false), FILTER_VALIDATE_BOOLEAN),
        'captcha_trigger_ip_attempts' => (int) env('AUTH_OTP_CAPTCHA_TRIGGER_IP_ATTEMPTS', 3),
        'captcha_trigger_ip_phone_attempts' => (int) env('AUTH_OTP_CAPTCHA_TRIGGER_IP_PHONE_ATTEMPTS', 2),
    ],

    'login_captcha' => [
        'enabled' => filter_var(
            env('AUTH_LOGIN_CAPTCHA_ENABLED', env('AUTH_OTP_CAPTCHA_ENABLED', false)),
            FILTER_VALIDATE_BOOLEAN
        ),
        'trigger_failures' => (int) env('AUTH_LOGIN_CAPTCHA_TRIGGER_FAILURES', 2),
    ],

];

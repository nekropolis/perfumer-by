<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Google reCAPTCHA v3
    |--------------------------------------------------------------------------
    |
    | Used by auth (login / OTP) and reviews. Values are read from .env at
    | config:cache time — do not call env() for these outside this file.
    |
    */

    'secret_key' => (string) env('RECAPTCHA_SECRET_KEY', ''),

    'min_score' => (float) env('RECAPTCHA_MIN_SCORE', 0.5),

    'reviews' => [
        'enabled' => filter_var(env('REVIEWS_RECAPTCHA_ENABLED', true), FILTER_VALIDATE_BOOLEAN),
        'action' => (string) env('REVIEWS_RECAPTCHA_ACTION', 'submit_review'),
    ],

];

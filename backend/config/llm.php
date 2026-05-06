<?php

return [
    'provider' => env('LLM_PROVIDER', 'anthropic'),

    'anthropic' => [
        'api_key' => env('ANTHROPIC_API_KEY'),
        'model' => env('ANTHROPIC_MODEL', 'claude-3-5-haiku-20241022'),
        'timeout' => (int) env('ANTHROPIC_TIMEOUT', 120),
        'max_retries' => (int) env('ANTHROPIC_MAX_RETRIES', 2),
    ],

    'openai' => [
        'api_key' => env('OPENAI_API_KEY'),
        'base_url' => env('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
        'model' => env('OPENAI_MODEL', 'gpt-4o-mini'),
        'timeout' => (int) env('OPENAI_TIMEOUT', 120),
        'max_retries' => (int) env('OPENAI_MAX_RETRIES', 2),
    ],

    'rewrite_on_import' => (bool) env('LLM_REWRITE_ON_IMPORT', false),

    'description' => [
        'min_source_length' => (int) env('LLM_DESC_MIN_SOURCE_LENGTH', 80),
        'min_output_length' => (int) env('LLM_DESC_MIN_OUTPUT_LENGTH', 700),
        'max_output_length' => (int) env('LLM_DESC_MAX_OUTPUT_LENGTH', 1500),
        'min_jaccard_vs_source' => (float) env('LLM_DESC_MIN_JACCARD', 0.08),
        'max_jaccard_vs_source' => (float) env('LLM_DESC_MAX_JACCARD', 0.72),
    ],
];

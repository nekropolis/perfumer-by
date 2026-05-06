<?php

namespace App\Services\Llm;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class OpenAiLlmClient implements LlmClientInterface
{
    public function complete(string $systemPrompt, string $userMessage, array $options = []): string
    {
        $apiKey = (string) config('llm.openai.api_key');
        if ($apiKey === '') {
            throw new RuntimeException('OPENAI_API_KEY is not configured');
        }

        $base = rtrim((string) config('llm.openai.base_url'), '/');
        $model = (string) config('llm.openai.model');
        $timeout = (int) config('llm.openai.timeout', 120);
        $maxRetries = (int) config('llm.openai.max_retries', 2);
        $maxTokens = (int) ($options['max_tokens'] ?? 4096);

        $response = Http::withToken($apiKey)
            ->timeout($timeout)
            ->retry($maxRetries, 2000)
            ->post($base.'/chat/completions', [
                'model' => $model,
                'max_tokens' => $maxTokens,
                'messages' => [
                    ['role' => 'system', 'content' => $systemPrompt],
                    ['role' => 'user', 'content' => $userMessage],
                ],
            ]);

        if (! $response->successful()) {
            throw new RuntimeException('OpenAI API error: HTTP '.$response->status().' '.$response->body());
        }

        $data = $response->json();
        $text = trim((string) data_get($data, 'choices.0.message.content'));
        if ($text === '') {
            throw new RuntimeException('OpenAI returned empty text');
        }

        return $text;
    }
}

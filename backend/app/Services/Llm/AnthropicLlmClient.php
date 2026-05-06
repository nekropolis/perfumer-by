<?php

namespace App\Services\Llm;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class AnthropicLlmClient implements LlmClientInterface
{
    public function complete(string $systemPrompt, string $userMessage, array $options = []): string
    {
        $apiKey = (string) config('llm.anthropic.api_key');
        if ($apiKey === '') {
            throw new RuntimeException('ANTHROPIC_API_KEY is not configured');
        }

        $model = (string) config('llm.anthropic.model');
        $timeout = (int) config('llm.anthropic.timeout', 120);
        $maxRetries = (int) config('llm.anthropic.max_retries', 2);
        $maxTokens = (int) ($options['max_tokens'] ?? 4096);

        $response = Http::withHeaders([
            'x-api-key' => $apiKey,
            'anthropic-version' => '2023-06-01',
            'content-type' => 'application/json',
        ])
            ->timeout($timeout)
            ->retry($maxRetries, 2000)
            ->post('https://api.anthropic.com/v1/messages', [
                'model' => $model,
                'max_tokens' => $maxTokens,
                'system' => $systemPrompt,
                'messages' => [
                    ['role' => 'user', 'content' => $userMessage],
                ],
            ]);

        if (! $response->successful()) {
            throw new RuntimeException('Anthropic API error: HTTP '.$response->status().' '.$response->body());
        }

        $data = $response->json();
        $text = '';
        foreach ((array) ($data['content'] ?? []) as $block) {
            if (is_array($block) && ($block['type'] ?? '') === 'text') {
                $text .= (string) ($block['text'] ?? '');
            }
        }

        $text = trim($text);
        if ($text === '') {
            throw new RuntimeException('Anthropic returned empty text');
        }

        return $text;
    }
}

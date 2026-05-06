<?php

namespace App\Services\Llm;

use RuntimeException;

class LlmClientFactory
{
    public function make(): LlmClientInterface
    {
        $provider = strtolower((string) config('llm.provider', 'anthropic'));

        return match ($provider) {
            'openai' => new OpenAiLlmClient,
            'anthropic' => new AnthropicLlmClient,
            default => throw new RuntimeException('Unknown LLM provider: '.$provider),
        };
    }
}

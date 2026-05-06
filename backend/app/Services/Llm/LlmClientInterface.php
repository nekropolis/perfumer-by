<?php

namespace App\Services\Llm;

interface LlmClientInterface
{
    /**
     * @param  array<string, mixed>  $options
     */
    public function complete(string $systemPrompt, string $userMessage, array $options = []): string;
}

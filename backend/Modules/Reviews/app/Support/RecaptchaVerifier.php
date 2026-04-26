<?php

namespace Modules\Reviews\Support;

use Illuminate\Support\Facades\Http;

final class RecaptchaVerifier
{
    public function isRequired(): bool
    {
        if ($this->secret() === '') {
            return false;
        }

        return filter_var(env('REVIEWS_RECAPTCHA_ENABLED', true), FILTER_VALIDATE_BOOLEAN);
    }

    public function verify(string $token, string $ip): bool
    {
        $secret = $this->secret();
        if ($secret === '') {
            return false;
        }

        try {
            $response = Http::asForm()
                ->timeout(5)
                ->post('https://www.google.com/recaptcha/api/siteverify', [
                    'secret' => $secret,
                    'response' => $token,
                    'remoteip' => $ip,
                ]);

            if (! $response->ok()) {
                return false;
            }

            $payload = $response->json();
            if (! is_array($payload)) {
                return false;
            }

            if (! (bool) ($payload['success'] ?? false)) {
                return false;
            }

            $expectedAction = (string) env('REVIEWS_RECAPTCHA_ACTION', 'submit_review');
            $action = (string) ($payload['action'] ?? '');
            if ($expectedAction !== '' && $action !== '' && $action !== $expectedAction) {
                return false;
            }

            $score = (float) ($payload['score'] ?? 0);
            $minScore = (float) env('RECAPTCHA_MIN_SCORE', 0.5);

            return $score >= $minScore;
        } catch (\Throwable) {
            return false;
        }
    }

    private function secret(): string
    {
        return (string) env('RECAPTCHA_SECRET_KEY', '');
    }
}

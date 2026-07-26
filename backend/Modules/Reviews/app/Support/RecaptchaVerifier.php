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

        return (bool) config('recaptcha.reviews.enabled', true);
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

            $expectedAction = (string) config('recaptcha.reviews.action', 'submit_review');
            $action = (string) ($payload['action'] ?? '');
            if ($expectedAction !== '' && $action !== '' && $action !== $expectedAction) {
                return false;
            }

            $score = (float) ($payload['score'] ?? 0);
            $minScore = (float) config('recaptcha.min_score', 0.5);

            return $score >= $minScore;
        } catch (\Throwable) {
            return false;
        }
    }

    private function secret(): string
    {
        return (string) config('recaptcha.secret_key', '');
    }
}

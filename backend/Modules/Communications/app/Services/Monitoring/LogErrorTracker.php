<?php

namespace Modules\Communications\Services\Monitoring;

use Illuminate\Support\Facades\File;

class LogErrorTracker
{
    private const STATE_PATH = 'monitoring/log-error-state.json';

    /**
     * @return array{new_errors: list<string>, total_scanned: int}
     */
    public function collectNewErrors(int $tailLines = 100): array
    {
        $lines = $this->readRecentLogLines($tailLines);
        $hashes = [];
        $messages = [];

        foreach ($lines as $line) {
            if (!$this->isErrorLine($line)) {
                continue;
            }

            $hash = $this->hashErrorLine($line);
            $hashes[] = $hash;
            $messages[$hash] = $this->formatErrorLine($line);
        }

        $state = $this->loadState();
        $acknowledged = $state['acknowledged_hashes'] ?? [];
        $newHashes = array_values(array_diff(array_unique($hashes), $acknowledged));

        $newErrors = [];
        foreach ($newHashes as $hash) {
            $newErrors[] = $messages[$hash] ?? $hash;
        }

        $merged = array_values(array_unique(array_merge($acknowledged, $hashes)));
        if (count($merged) > 500) {
            $merged = array_slice($merged, -500);
        }

        $this->saveState([
            'last_check_at' => now()->toIso8601String(),
            'acknowledged_hashes' => $merged,
        ]);

        return [
            'new_errors' => $newErrors,
            'total_scanned' => count($lines),
        ];
    }

    /**
     * @return list<string>
     */
    private function readRecentLogLines(int $tailLines): array
    {
        $paths = [
            storage_path('logs/laravel-' . now()->format('Y-m-d') . '.log'),
            storage_path('logs/laravel-' . now()->subDay()->format('Y-m-d') . '.log'),
            storage_path('logs/laravel.log'),
        ];

        $lines = [];
        foreach (array_unique($paths) as $path) {
            if (!is_readable($path)) {
                continue;
            }
            $lines = array_merge($lines, $this->tailFile($path, $tailLines));
        }

        return array_values(array_unique($lines));
    }

    /**
     * @return list<string>
     */
    private function tailFile(string $path, int $lines): array
    {
        $file = new \SplFileObject($path, 'r');
        $file->seek(PHP_INT_MAX);
        $lastLine = $file->key();
        $start = max(0, $lastLine - $lines);

        $result = [];
        $file->seek($start);
        while (!$file->eof()) {
            $line = rtrim((string) $file->current(), "\r\n");
            if ($line !== '') {
                $result[] = $line;
            }
            $file->next();
        }

        return $result;
    }

    private function isErrorLine(string $line): bool
    {
        return (bool) preg_match('/\.(ERROR|CRITICAL|ALERT|EMERGENCY):/i', $line);
    }

    private function hashErrorLine(string $line): string
    {
        $normalized = preg_replace('/^\[[^\]]+\]\s+\w+\./', '', $line) ?? $line;
        $normalized = preg_replace('/\s+/', ' ', trim($normalized));

        return sha1($normalized);
    }

    private function formatErrorLine(string $line): string
    {
        $trimmed = mb_strlen($line) > 220 ? mb_substr($line, 0, 220) . '…' : $line;

        return $trimmed;
    }

    /**
     * @return array{last_check_at?: string, acknowledged_hashes?: list<string>}
     */
    private function loadState(): array
    {
        $path = storage_path('app/' . self::STATE_PATH);
        if (!is_readable($path)) {
            return [];
        }

        $decoded = json_decode((string) file_get_contents($path), true);

        return is_array($decoded) ? $decoded : [];
    }

    /**
     * @param array{last_check_at: string, acknowledged_hashes: list<string>} $state
     */
    private function saveState(array $state): void
    {
        $dir = storage_path('app/monitoring');
        if (!is_dir($dir)) {
            File::makeDirectory($dir, 0755, true);
        }

        file_put_contents(
            storage_path('app/' . self::STATE_PATH),
            json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
        );
    }
}

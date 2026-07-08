<?php

namespace Modules\Communications\Services\Monitoring;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Str;

class ServerHealthMonitorService
{
    public function __construct(
        private readonly LogErrorTracker $logErrorTracker
    ) {
    }

    /**
     * @return array{
     *     host: string,
     *     app_url: string,
     *     checked_at: string,
     *     new_log_errors: list<string>,
     *     checks: list<array{name: string, status: string, message: string}>,
     *     has_alerts: bool
     * }
     */
    public function collect(bool $weekly = false): array
    {
        $tailLines = (int) config('communications.server_monitor.log_tail_lines', 100);
        $logScan = $this->logErrorTracker->collectNewErrors($tailLines);

        $checks = array_merge(
            $this->checkHttpHealth(),
            $this->checkDatabase(),
            $this->checkRedis(),
            $this->checkMeilisearch(),
            $this->checkMemory(),
            $this->checkDisk(),
            $this->checkSupervisor(),
            $this->checkPm2(),
            $this->checkSystemd(['nginx', 'php8.3-fpm', 'mysql', 'redis-server', 'meilisearch']),
            $this->checkQueue(),
            $this->checkFailedJobs(),
            $this->checkSslExpiry(),
        );

        $hasAlerts = count($logScan['new_errors']) > 0
            || $this->hasFailedChecks($checks);

        return [
            'host' => (string) gethostname(),
            'app_url' => (string) config('app.url'),
            'checked_at' => now()->timezone('Europe/Minsk')->format('Y-m-d H:i:s T'),
            'weekly' => $weekly,
            'new_log_errors' => $logScan['new_errors'],
            'checks' => $checks,
            'has_alerts' => $hasAlerts,
        ];
    }

    /**
     * @param array{
     *     host: string,
     *     app_url: string,
     *     checked_at: string,
     *     weekly?: bool,
     *     new_log_errors: list<string>,
     *     checks: list<array{name: string, status: string, message: string}>,
     *     has_alerts: bool
     * } $report
     */
    public function formatTelegramMessage(array $report): string
    {
        $mode = !empty($report['weekly']) ? 'Еженедельный отчёт' : 'Мониторинг';
        $lines = [
            "🖥 {$mode} — {$report['app_url']}",
            "Хост: {$report['host']}",
            "Время: {$report['checked_at']}",
            '',
        ];

        if (count($report['new_log_errors']) > 0) {
            $lines[] = '⚠️ Новые ошибки в логах (' . count($report['new_log_errors']) . '):';
            foreach (array_slice($report['new_log_errors'], 0, 8) as $error) {
                $lines[] = '• ' . $error;
            }
            if (count($report['new_log_errors']) > 8) {
                $lines[] = '…ещё ' . (count($report['new_log_errors']) - 8);
            }
            $lines[] = '';
        } elseif (!empty($report['weekly'])) {
            $lines[] = '✅ Новых ошибок в логах нет';
            $lines[] = '';
        }

        $lines[] = 'Проверки:';
        foreach ($report['checks'] as $check) {
            $icon = match ($check['status']) {
                'ok' => '✅',
                'warn' => '⚠️',
                default => '❌',
            };
            $lines[] = "{$icon} {$check['name']}: {$check['message']}";
        }

        return implode("\n", $lines);
    }

    /**
     * @param list<array{name: string, status: string, message: string}> $checks
     */
    private function hasFailedChecks(array $checks): bool
    {
        foreach ($checks as $check) {
            if ($check['status'] === 'fail') {
                return true;
            }
        }

        return false;
    }

    /**
     * @return list<array{name: string, status: string, message: string}>
     */
    private function checkHttpHealth(): array
    {
        $url = rtrim((string) config('app.url'), '/') . '/up';

        try {
            $response = Http::timeout(8)->get($url);
            if ($response->successful()) {
                return [[
                    'name' => 'HTTP /up',
                    'status' => 'ok',
                    'message' => (string) $response->status(),
                ]];
            }

            return [[
                'name' => 'HTTP /up',
                'status' => 'fail',
                'message' => 'HTTP ' . $response->status(),
            ]];
        } catch (\Throwable $e) {
            return [[
                'name' => 'HTTP /up',
                'status' => 'fail',
                'message' => Str::limit($e->getMessage(), 120),
            ]];
        }
    }

    /**
     * @return list<array{name: string, status: string, message: string}>
     */
    private function checkDatabase(): array
    {
        try {
            DB::connection()->getPdo();

            return [[
                'name' => 'MySQL',
                'status' => 'ok',
                'message' => 'подключение ok',
            ]];
        } catch (\Throwable $e) {
            return [[
                'name' => 'MySQL',
                'status' => 'fail',
                'message' => Str::limit($e->getMessage(), 120),
            ]];
        }
    }

    /**
     * @return list<array{name: string, status: string, message: string}>
     */
    private function checkRedis(): array
    {
        try {
            $pong = Redis::connection()->ping();

            return [[
                'name' => 'Redis',
                'status' => 'ok',
                'message' => is_string($pong) ? $pong : 'ok',
            ]];
        } catch (\Throwable $e) {
            return [[
                'name' => 'Redis',
                'status' => 'fail',
                'message' => Str::limit($e->getMessage(), 120),
            ]];
        }
    }

    /**
     * @return list<array{name: string, status: string, message: string}>
     */
    private function checkMeilisearch(): array
    {
        if (!config('services.catalog_search.enabled', false)) {
            return [[
                'name' => 'Meilisearch',
                'status' => 'ok',
                'message' => 'поиск выключен (CATALOG_SEARCH_ENABLED=false)',
            ]];
        }

        $url = rtrim((string) config('services.catalog_search.meilisearch.url', ''), '/');
        if ($url === '') {
            return [[
                'name' => 'Meilisearch',
                'status' => 'warn',
                'message' => 'URL не задан',
            ]];
        }

        try {
            $request = Http::timeout(3);
            $key = (string) config('services.catalog_search.meilisearch.api_key', '');
            if ($key !== '') {
                $request = $request->withToken($key);
            }

            $response = $request->get($url . '/health');
            if ($response->successful()) {
                return [[
                    'name' => 'Meilisearch',
                    'status' => 'ok',
                    'message' => 'available',
                ]];
            }

            return [[
                'name' => 'Meilisearch',
                'status' => 'fail',
                'message' => 'HTTP ' . $response->status(),
            ]];
        } catch (\Throwable $e) {
            return [[
                'name' => 'Meilisearch',
                'status' => 'fail',
                'message' => Str::limit($e->getMessage(), 120),
            ]];
        }
    }

    /**
     * @return list<array{name: string, status: string, message: string}>
     */
    private function checkMemory(): array
    {
        $result = Process::run(['bash', '-lc', "free -m | awk '/^Mem:/{print $2\" \"$3\" \"$4\" \"$7}'"]);
        if (!$result->successful()) {
            return [[
                'name' => 'RAM',
                'status' => 'warn',
                'message' => 'не удалось прочитать free -m',
            ]];
        }

        $parts = preg_split('/\s+/', trim($result->output()));
        $total = (int) ($parts[0] ?? 0);
        $used = (int) ($parts[1] ?? 0);
        $available = (int) ($parts[3] ?? 0);

        $criticalMb = (int) config('communications.server_monitor.mem_critical_mb', 120);
        $warnMb = (int) config('communications.server_monitor.mem_warn_mb', 250);

        $status = 'ok';
        if ($available <= $criticalMb) {
            $status = 'fail';
        } elseif ($available <= $warnMb) {
            $status = 'warn';
        }

        return [[
            'name' => 'RAM',
            'status' => $status,
            'message' => "total {$total}MB, used {$used}MB, available {$available}MB",
        ]];
    }

    /**
     * @return list<array{name: string, status: string, message: string}>
     */
    private function checkDisk(): array
    {
        $path = base_path();
        $result = Process::run(['bash', '-lc', "df -P " . escapeshellarg($path) . " | awk 'NR==2 {print $2\" \"$3\" \"$4\" \"$5}'"]);
        if (!$result->successful()) {
            return [[
                'name' => 'Диск',
                'status' => 'warn',
                'message' => 'не удалось прочитать df',
            ]];
        }

        $parts = preg_split('/\s+/', trim($result->output()));
        $totalKb = (int) ($parts[0] ?? 0);
        $usedKb = (int) ($parts[1] ?? 0);
        $availKb = (int) ($parts[2] ?? 0);
        $usedPercent = (int) rtrim((string) ($parts[3] ?? '0'), '%');

        $warnPercent = (int) config('communications.server_monitor.disk_warn_percent', 85);
        $criticalPercent = (int) config('communications.server_monitor.disk_critical_percent', 95);

        $status = 'ok';
        if ($usedPercent >= $criticalPercent) {
            $status = 'fail';
        } elseif ($usedPercent >= $warnPercent) {
            $status = 'warn';
        }

        $totalGb = round($totalKb / 1024 / 1024, 1);
        $availGb = round($availKb / 1024 / 1024, 1);

        return [[
            'name' => 'Диск',
            'status' => $status,
            'message' => "занято {$usedPercent}% (свободно {$availGb}GB из {$totalGb}GB)",
        ]];
    }

    /**
     * @return list<array{name: string, status: string, message: string}>
     */
    private function checkSupervisor(): array
    {
        $program = (string) config('communications.server_monitor.supervisor_program', 'perfumer-queue');
        $result = Process::run(['bash', '-lc', 'command -v supervisorctl >/dev/null && supervisorctl status || true']);
        if (trim($result->output()) === '') {
            return [[
                'name' => 'Supervisor',
                'status' => 'warn',
                'message' => 'supervisorctl недоступен',
            ]];
        }

        $lines = preg_split('/\r\n|\r|\n/', trim($result->output())) ?: [];
        $matched = array_values(array_filter($lines, static fn (string $line): bool => str_contains($line, $program)));

        if ($matched === []) {
            return [[
                'name' => 'Supervisor',
                'status' => 'fail',
                'message' => "процесс {$program} не найден",
            ]];
        }

        $running = array_values(array_filter($matched, static fn (string $line): bool => str_contains($line, 'RUNNING')));

        return [[
            'name' => 'Supervisor',
            'status' => count($running) === count($matched) ? 'ok' : 'fail',
            'message' => implode('; ', $matched),
        ]];
    }

    /**
     * @return list<array{name: string, status: string, message: string}>
     */
    private function checkPm2(): array
    {
        $processName = (string) config('communications.server_monitor.pm2_process', 'frontend-staging');
        $result = Process::run(['bash', '-lc', 'command -v pm2 >/dev/null && pm2 jlist || echo "[]"']);
        if (!$result->successful()) {
            return [[
                'name' => 'PM2',
                'status' => 'warn',
                'message' => 'pm2 недоступен',
            ]];
        }

        $output = trim($result->output());
        $list = json_decode($output, true);
        if (!is_array($list)) {
            $stderr = trim($result->errorOutput());

            return [[
                'name' => 'PM2',
                'status' => 'fail',
                'message' => 'не удалось разобрать pm2 jlist' . ($stderr !== '' ? ': ' . Str::limit($stderr, 80) : ''),
            ]];
        }

        foreach ($list as $item) {
            if (($item['name'] ?? '') !== $processName) {
                continue;
            }

            $status = (string) ($item['pm2_env']['status'] ?? 'unknown');
            $restarts = (int) ($item['pm2_env']['restart_time'] ?? 0);
            $memory = (int) (($item['monit']['memory'] ?? 0) / 1024 / 1024);

            return [[
                'name' => 'PM2',
                'status' => $status === 'online' ? 'ok' : 'fail',
                'message' => "{$processName}: {$status}, restarts={$restarts}, mem={$memory}MB",
            ]];
        }

        return [[
            'name' => 'PM2',
            'status' => 'fail',
            'message' => "процесс {$processName} не найден",
        ]];
    }

    /**
     * @param list<string> $services
     * @return list<array{name: string, status: string, message: string}>
     */
    private function checkSystemd(array $services): array
    {
        $checks = [];
        foreach ($services as $service) {
            $result = Process::run(['systemctl', 'is-active', $service]);
            $active = trim($result->output());
            $checks[] = [
                'name' => "systemd:{$service}",
                'status' => $active === 'active' ? 'ok' : 'fail',
                'message' => $active !== '' ? $active : 'inactive',
            ];
        }

        return $checks;
    }

    /**
     * @return list<array{name: string, status: string, message: string}>
     */
    private function checkQueue(): array
    {
        try {
            $connection = (string) config('queue.default');
            if ($connection !== 'redis') {
                return [[
                    'name' => 'Очередь',
                    'status' => 'ok',
                    'message' => "driver={$connection}",
                ]];
            }

            $queue = (string) config('communications.server_monitor.queue_name', 'default');
            $len = (int) Queue::size($queue);
            $warn = (int) config('communications.server_monitor.queue_warn_size', 100);

            return [[
                'name' => 'Очередь Redis',
                'status' => $len >= $warn ? 'warn' : 'ok',
                'message' => "{$queue}: {$len} jobs",
            ]];
        } catch (\Throwable $e) {
            return [[
                'name' => 'Очередь Redis',
                'status' => 'warn',
                'message' => Str::limit($e->getMessage(), 120),
            ]];
        }
    }

    /**
     * @return list<array{name: string, status: string, message: string}>
     */
    private function checkFailedJobs(): array
    {
        try {
            if (!DB::getSchemaBuilder()->hasTable('failed_jobs')) {
                return [];
            }

            $count = (int) DB::table('failed_jobs')
                ->where('failed_at', '>=', now()->subDay())
                ->count();

            return [[
                'name' => 'Failed jobs (24ч)',
                'status' => $count > 0 ? 'warn' : 'ok',
                'message' => (string) $count,
            ]];
        } catch (\Throwable $e) {
            return [[
                'name' => 'Failed jobs (24ч)',
                'status' => 'warn',
                'message' => Str::limit($e->getMessage(), 120),
            ]];
        }
    }

    /**
     * @return list<array{name: string, status: string, message: string}>
     */
    private function checkSslExpiry(): array
    {
        $host = parse_url((string) config('app.url'), PHP_URL_HOST);
        if (!is_string($host) || $host === '') {
            return [];
        }

        $result = Process::run([
            'bash',
            '-lc',
            'echo | openssl s_client -servername ' . escapeshellarg($host) . ' -connect ' . escapeshellarg($host . ':443') . ' 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null || true',
        ]);

        $line = trim($result->output());
        if ($line === '' || !str_starts_with($line, 'notAfter=')) {
            return [];
        }

        $expires = strtotime(str_replace('notAfter=', '', $line));
        if ($expires === false) {
            return [];
        }

        $days = (int) floor(($expires - time()) / 86400);
        $status = $days <= 7 ? 'fail' : ($days <= 21 ? 'warn' : 'ok');

        return [[
            'name' => 'SSL',
            'status' => $status,
            'message' => "истекает через {$days} дн.",
        ]];
    }
}

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
            $this->checkLoadAverage(),
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
        $base = rtrim((string) config('app.url'), '/');
        $storefront = rtrim((string) config('communications.server_monitor.storefront_health_url', 'http://127.0.0.1:3000'), '/');

        return array_merge(
            $this->probeHttpUrl($base . '/up', 'HTTP /up'),
            $this->probeHttpUrl($storefront . '/', 'HTTP витрина PM2'),
        );
    }

    /**
     * @return list<array{name: string, status: string, message: string}>
     */
    private function probeHttpUrl(string $url, string $name): array
    {
        try {
            $response = Http::timeout(8)->get($url);
            if ($response->successful()) {
                return [[
                    'name' => $name,
                    'status' => 'ok',
                    'message' => (string) $response->status(),
                ]];
            }

            return [[
                'name' => $name,
                'status' => 'fail',
                'message' => 'HTTP ' . $response->status(),
            ]];
        } catch (\Throwable $e) {
            return [[
                'name' => $name,
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
    private function checkLoadAverage(): array
    {
        $loadRaw = @file_get_contents('/proc/loadavg');
        if (!is_string($loadRaw) || trim($loadRaw) === '') {
            return [[
                'name' => 'Load average',
                'status' => 'warn',
                'message' => 'не удалось прочитать /proc/loadavg',
            ]];
        }

        $parts = preg_split('/\s+/', trim($loadRaw));
        $load1 = (float) ($parts[0] ?? 0);
        $load5 = (float) ($parts[1] ?? 0);

        $cpuResult = Process::run(['bash', '-lc', 'nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null || echo 1']);
        $cpus = max(1, (int) trim($cpuResult->output()));

        $warnMultiplier = (float) config('communications.server_monitor.load_warn_multiplier', 1.5);
        $criticalMultiplier = (float) config('communications.server_monitor.load_critical_multiplier', 2.0);
        $warnThreshold = round($cpus * $warnMultiplier, 2);
        $criticalThreshold = round($cpus * $criticalMultiplier, 2);

        $status = 'ok';
        if ($load1 >= $criticalThreshold) {
            $status = 'fail';
        } elseif ($load1 >= $warnThreshold) {
            $status = 'warn';
        }

        return [[
            'name' => 'Load average',
            'status' => $status,
            'message' => "1m={$load1}, 5m={$load5}, CPUs={$cpus}, warn≥{$warnThreshold}, critical≥{$criticalThreshold}",
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
     * @return string
     */
    private function supervisorctlStatusOutput(): string
    {
        $result = Process::run([
            'bash',
            '-lc',
            'command -v supervisorctl >/dev/null && (sudo supervisorctl status 2>/dev/null || supervisorctl status 2>/dev/null) || true',
        ]);

        return trim($result->output());
    }

    private function checkSupervisor(): array
    {
        $program = (string) config('communications.server_monitor.supervisor_program', 'perfumer-queue');
        $output = $this->supervisorctlStatusOutput();
        if ($output === '') {
            return [[
                'name' => 'Supervisor',
                'status' => 'warn',
                'message' => 'supervisorctl недоступен',
            ]];
        }

        $lines = preg_split('/\r\n|\r|\n/', $output) ?: [];
        $matched = array_values(array_filter($lines, static fn (string $line): bool => str_contains($line, $program)));

        if ($matched === []) {
            // Retry 3x — worker может быть в процессе перезапуска supervisor.
            for ($attempt = 2; $attempt <= 3; $attempt++) {
                sleep(10);
                $output = $this->supervisorctlStatusOutput();
                $lines = preg_split('/\r\n|\r|\n/', $output) ?: [];
                $matched = array_values(array_filter($lines, static fn (string $line): bool => str_contains($line, $program)));
                if ($matched !== []) {
                    break;
                }
            }

            if ($matched === []) {
                return [[
                    'name' => 'Supervisor',
                    'status' => 'fail',
                    'message' => "процесс {$program} не найден",
                ]];
            }
        }

        $checks = [];
        foreach ($matched as $line) {
            $status = $this->parseSupervisorStatusLine($line);
            $state = $status['state'];
            $uptimeSeconds = $status['uptime_seconds'];

            // Если не RUNNING — подождать и проверить ещё раз.
            // После длинных job (price refresh) worker часто в STARTING из‑за --max-time/--memory.
            if ($state !== 'RUNNING') {
                $maxAttempts = in_array($state, ['STARTING', 'STOPPING'], true) ? 12 : 3;
                for ($attempt = 2; $attempt <= $maxAttempts; $attempt++) {
                    sleep(10);
                    $retryOutput = $this->supervisorctlStatusOutput();
                    $retryLines = preg_split('/\r\n|\r|\n/', $retryOutput) ?: [];
                    $retryMatched = array_values(array_filter($retryLines, static fn (string $l): bool => str_contains($l, $program)));
                    foreach ($retryMatched as $retryLine) {
                        $retryStatus = $this->parseSupervisorStatusLine($retryLine);
                        if ($retryStatus['state'] === 'RUNNING') {
                            $state = 'RUNNING';
                            $uptimeSeconds = $retryStatus['uptime_seconds'];
                            $line = $retryLine;
                            break 2;
                        }
                        $state = $retryStatus['state'] !== '' ? $retryStatus['state'] : $state;
                    }
                }
            }

            if ($state !== 'RUNNING') {
                $checks[] = [
                    'name' => 'Supervisor',
                    'status' => 'fail',
                    'message' => $line,
                ];

                continue;
            }

            $minUptimeSeconds = (int) config('communications.server_monitor.supervisor_min_uptime_seconds', 120);
            if ($uptimeSeconds !== null && $minUptimeSeconds > 0 && $uptimeSeconds < $minUptimeSeconds) {
                $checks[] = [
                    'name' => 'Supervisor',
                    'status' => 'warn',
                    'message' => "только что перезапустился: {$line}",
                ];

                continue;
            }

            $checks[] = [
                'name' => 'Supervisor',
                'status' => 'ok',
                'message' => $line,
            ];
        }

        return $checks;
    }

    /**
     * @return array{state: string, uptime_seconds: int|null}
     */
    private function parseSupervisorStatusLine(string $line): array
    {
        $line = trim($line);
        $parts = preg_split('/\s+/', $line) ?: [];
        $state = '';
        foreach ($parts as $part) {
            if (in_array($part, ['RUNNING', 'STOPPED', 'STARTING', 'BACKOFF', 'FATAL', 'EXITED', 'UNKNOWN'], true)) {
                $state = $part;
                break;
            }
        }

        $uptimeSeconds = null;
        if (preg_match('/uptime\s+(.+)$/iu', $line, $matches)) {
            $uptimeSeconds = $this->parseUptimeToSeconds($matches[1]);
        }

        return ['state' => $state, 'uptime_seconds' => $uptimeSeconds];
    }

    private function parseUptimeToSeconds(string $uptime): ?int
    {
        $uptime = trim($uptime);
        $seconds = 0;

        if (preg_match('/(\d+)\s+days?/iu', $uptime, $daysMatch)) {
            $seconds += (int) $daysMatch[1] * 86400;
        }

        if (preg_match('/(\d+):(\d+):(\d+)$/u', $uptime, $timeMatch)) {
            $seconds += (int) $timeMatch[1] * 3600 + (int) $timeMatch[2] * 60 + (int) $timeMatch[3];
        }

        return $seconds > 0 ? $seconds : null;
    }

    /**
     * @return list<array{name: string, status: string, message: string}>
     */
    private function checkPm2(): array
    {
        $processName = (string) config('communications.server_monitor.pm2_process', 'perfumer-frontend');
        $pm2User = (string) config('communications.server_monitor.pm2_user', 'deploy');
        $result = Process::run(['bash', '-lc', 'sudo -u ' . escapeshellarg($pm2User) . ' pm2 jlist 2>/dev/null || echo "[]"']);
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

<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Modules\ImportExport\Support\ElParfume\ElParfumeRedirectVerifier;

class ElParfumeVerifyRedirectsCommand extends Command
{
    private const REPORT_COLUMNS = [
        'old_path',
        'expected_target',
        'status',
        'location',
        'target_status',
        'result',
        'gsc_impressions',
        'error',
    ];

    protected $signature = 'elparfume:verify-redirects
        {--in=storage/app/elparfume/redirect_map.csv : Redirect map CSV}
        {--old-host=https://el-parfume.by : Legacy site origin to request}
        {--new-host=https://perfumer.by : Expected redirect target origin}
        {--host-header= : Host header when old-host is an IP or staging URL}
        {--concurrency=10 : Parallel HTTP requests per batch}
        {--limit= : Max redirect_map rows to verify}
        {--only-gsc : Verify only rows with gsc_impressions > 0}
        {--variants : Also verify trailing slash, UTM, http and www variants}
        {--out=storage/app/elparfume/verify_report.csv : Verification report CSV}
        {--timeout=15 : HTTP timeout in seconds}';

    protected $description = 'Verify el-parfume.by redirects against redirect_map.csv';

    public function handle(ElParfumeRedirectVerifier $verifier): int
    {
        $inPath = $this->resolvePath((string) $this->option('in'));
        $outPath = $this->resolvePath((string) $this->option('out'));
        $oldHost = rtrim(trim((string) $this->option('old-host')), '/');
        $newHost = rtrim(trim((string) $this->option('new-host')), '/');
        $hostHeader = trim((string) $this->option('host-header'));
        $concurrency = max(1, (int) $this->option('concurrency'));
        $limit = $this->option('limit');
        $limit = $limit === null || $limit === '' ? null : max(1, (int) $limit);
        $onlyGsc = (bool) $this->option('only-gsc');
        $variants = (bool) $this->option('variants');
        $timeout = max(1, (int) $this->option('timeout'));

        if (! is_file($inPath)) {
            $this->error("Input CSV not found: {$inPath}");

            return self::FAILURE;
        }

        $rows = $this->readCsv($inPath);
        $jobs = [];
        foreach ($rows as $row) {
            $oldPath = trim((string) ($row['old_path'] ?? ''));
            $target = trim((string) ($row['target'] ?? ''));
            if ($oldPath === '' || $target === '') {
                continue;
            }
            $gsc = (int) ($row['gsc_impressions'] ?? 0);
            if ($onlyGsc && $gsc <= 0) {
                continue;
            }

            $jobs[] = [
                'old_path' => $oldPath,
                'expected_target' => $target,
                'gsc_impressions' => (string) $gsc,
            ];

            if ($variants) {
                foreach ($verifier->variantUrls($oldHost, $oldPath) as $variantUrl) {
                    $jobs[] = [
                        'old_path' => $variantUrl,
                        'expected_target' => $target,
                        'gsc_impressions' => '0',
                    ];
                }
            }
        }

        if ($limit !== null) {
            $jobs = array_slice($jobs, 0, $limit);
        }

        if ($jobs === []) {
            $this->warn('No rows to verify.');
            $this->writeReport($outPath, []);

            return self::SUCCESS;
        }

        $this->checkSiteAssets($oldHost, $hostHeader, $timeout);

        $report = [];
        foreach (array_chunk($jobs, $concurrency, true) as $chunk) {
            $report = array_merge($report, $this->verifyChunk(
                $chunk,
                $verifier,
                $oldHost,
                $newHost,
                $hostHeader,
                $timeout,
            ));
        }

        $this->writeReport($outPath, $report);
        $exitCode = $this->printSummary($report);

        return $exitCode;
    }

    private function resolvePath(string $path): string
    {
        $path = trim($path);
        if ($path === '' || $path[0] === DIRECTORY_SEPARATOR) {
            return $path;
        }

        return base_path($path);
    }

    /**
     * @return list<array<string, string>>
     */
    private function readCsv(string $path): array
    {
        $handle = fopen($path, 'rb');
        if (! $handle) {
            throw new \RuntimeException("Cannot read CSV: {$path}");
        }

        $header = fgetcsv($handle);
        if (! is_array($header) || $header === []) {
            fclose($handle);

            return [];
        }
        $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $header[0]) ?? (string) $header[0];
        $header = array_map(static fn ($column): string => trim((string) $column), $header);
        $width = count($header);

        $rows = [];
        while (($row = fgetcsv($handle)) !== false) {
            if (! is_array($row) || $row === [null] || $row === []) {
                continue;
            }
            $row = array_pad($row, $width, '');
            $assoc = array_combine($header, array_slice($row, 0, $width));
            if (! is_array($assoc)) {
                continue;
            }
            $normalized = [];
            foreach ($assoc as $key => $value) {
                $normalized[(string) $key] = trim((string) $value);
            }
            $rows[] = $normalized;
        }

        fclose($handle);

        return $rows;
    }

    /**
     * @param  list<array{old_path:string,expected_target:string,gsc_impressions:string}>  $jobs
     * @return list<array<string, string>>
     */
    private function verifyChunk(
        array $chunk,
        ElParfumeRedirectVerifier $verifier,
        string $oldHost,
        string $newHost,
        string $hostHeader,
        int $timeout,
    ): array {
        $sourceRequests = [];
        foreach ($chunk as $index => $job) {
            $url = str_starts_with($job['old_path'], 'http://') || str_starts_with($job['old_path'], 'https://')
                ? $job['old_path']
                : $verifier->joinOldUrl($oldHost, $job['old_path']);
            $sourceRequests[$index] = $url;
        }

        /** @var array<int, Response> $sourceResponses */
        $sourceResponses = Http::pool(function (Pool $pool) use ($sourceRequests, $hostHeader, $timeout): void {
            foreach ($sourceRequests as $index => $url) {
                $pending = $pool->as((string) $index)
                    ->timeout($timeout)
                    ->withOptions(['allow_redirects' => false]);
                if ($hostHeader !== '') {
                    $pending = $pending->withHeaders(['Host' => $hostHeader]);
                }
                $pending->get($url);
            }
        });

        $targetRequests = [];
        foreach ($chunk as $index => $job) {
            $source = $sourceResponses[$index] ?? null;
            $expected = $verifier->buildExpectedLocation($newHost, $job['expected_target']);
            if (! $source instanceof Response || $source->status() !== 301) {
                continue;
            }
            $location = trim((string) $source->header('Location'));
            if ($location === '') {
                continue;
            }
            $absolute = $this->absoluteLocation($location, $sourceRequests[$index]);
            if ($verifier->normalizeComparableUrl($absolute) !== $expected) {
                continue;
            }
            $targetRequests[$index] = $absolute;
        }

        /** @var array<int, Response> $targetResponses */
        $targetResponses = [];
        if ($targetRequests !== []) {
            $targetResponses = Http::pool(function (Pool $pool) use ($targetRequests, $timeout): void {
                foreach ($targetRequests as $index => $url) {
                    $pool->as((string) $index)
                        ->timeout($timeout)
                        ->withOptions(['allow_redirects' => false])
                        ->get($url);
                }
            });
        }

        $report = [];
        foreach ($chunk as $index => $job) {
            $rawSource = $sourceResponses[$index] ?? null;
            $sourceError = '';
            if ($rawSource instanceof \Throwable) {
                $sourceError = $rawSource->getMessage();
                $rawSource = null;
            }

            $expectedLocation = $verifier->buildExpectedLocation($newHost, $job['expected_target']);
            $rawTarget = isset($targetRequests[$index]) ? ($targetResponses[$index] ?? null) : null;
            if ($rawTarget instanceof \Throwable) {
                $sourceError = $sourceError !== '' ? $sourceError : $rawTarget->getMessage();
                $rawTarget = null;
            }

            $evaluation = $verifier->evaluate(
                $rawSource instanceof Response ? $rawSource : null,
                $rawTarget instanceof Response ? $rawTarget : null,
                $expectedLocation,
                $sourceError,
            );

            if ($evaluation['result'] === ElParfumeRedirectVerifier::RESULT_MULTI_HOP && $rawTarget instanceof Response) {
                $evaluation['error'] = $this->buildRedirectChain(
                    $targetRequests[$index] ?? '',
                    $rawTarget,
                    $timeout,
                );
            }

            $report[] = [
                'old_path' => $job['old_path'],
                'expected_target' => $job['expected_target'],
                'status' => $evaluation['status'] === null ? '' : (string) $evaluation['status'],
                'location' => $evaluation['location'],
                'target_status' => $evaluation['target_status'] === null ? '' : (string) $evaluation['target_status'],
                'result' => $evaluation['result'],
                'gsc_impressions' => $job['gsc_impressions'],
                'error' => $evaluation['error'],
            ];
        }

        return $report;
    }

    private function buildRedirectChain(string $firstUrl, Response $secondResponse, int $timeout): string
    {
        $chain = [$firstUrl];
        $next = trim((string) $secondResponse->header('Location'));
        if ($next !== '') {
            $chain[] = $this->absoluteLocation($next, $firstUrl);
        }

        if ($next !== '' && count($chain) < 3) {
            $thirdUrl = end($chain);
            if (is_string($thirdUrl)) {
                $third = Http::timeout($timeout)
                    ->withOptions(['allow_redirects' => false])
                    ->get($thirdUrl);
                $thirdLocation = trim((string) $third->header('Location'));
                if ($thirdLocation !== '') {
                    $chain[] = $this->absoluteLocation($thirdLocation, $thirdUrl);
                }
            }
        }

        return implode(' -> ', array_slice($chain, 0, 3));
    }

    private function absoluteLocation(string $location, string $baseUrl): string
    {
        if (str_starts_with($location, 'http://') || str_starts_with($location, 'https://')) {
            return $location;
        }
        $parts = parse_url($baseUrl);
        if (! is_array($parts) || ! isset($parts['scheme'], $parts['host'])) {
            return $location;
        }
        $origin = $parts['scheme'].'://'.$parts['host'];
        if (isset($parts['port'])) {
            $origin .= ':'.$parts['port'];
        }

        return str_starts_with($location, '/') ? $origin.$location : $origin.'/'.$location;
    }

    private function checkSiteAssets(string $oldHost, string $hostHeader, int $timeout): void
    {
        $pending = Http::timeout($timeout)->withOptions(['allow_redirects' => false]);
        if ($hostHeader !== '') {
            $pending = $pending->withHeaders(['Host' => $hostHeader]);
        }

        $robots = $pending->get($oldHost.'/robots.txt');
        if ($robots->status() !== 200) {
            $this->warn("robots.txt returned HTTP {$robots->status()} (expected 200)");
        }

        $sitemap = $pending->get($oldHost.'/sitemap.xml');
        if ($sitemap->status() !== 301) {
            $this->warn("sitemap.xml returned HTTP {$sitemap->status()} (expected 301)");
        }
    }

    /**
     * @param  list<array<string, string>>  $report
     */
    private function writeReport(string $path, array $report): void
    {
        $dir = dirname($path);
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $handle = fopen($path, 'wb');
        if (! $handle) {
            throw new \RuntimeException("Cannot write report: {$path}");
        }

        fputcsv($handle, self::REPORT_COLUMNS);
        foreach ($report as $row) {
            $line = [];
            foreach (self::REPORT_COLUMNS as $column) {
                $line[] = $row[$column] ?? '';
            }
            fputcsv($handle, $line);
        }
        fclose($handle);

        $this->line("Wrote: {$path}");
    }

    /**
     * @param  list<array<string, string>>  $report
     */
    private function printSummary(array $report): int
    {
        $counts = [];
        foreach ($report as $row) {
            $result = $row['result'] ?? ElParfumeRedirectVerifier::RESULT_ERROR;
            $counts[$result] = ($counts[$result] ?? 0) + 1;
        }

        $this->info('el-parfume redirect verification finished.');
        foreach ($counts as $result => $count) {
            $this->line("{$result}: {$count}");
        }

        $okImpressions = 0;
        $failedImpressions = 0;
        $failures = [];
        foreach ($report as $row) {
            $gsc = (int) ($row['gsc_impressions'] ?? 0);
            if ($gsc <= 0) {
                continue;
            }
            if (($row['result'] ?? '') === ElParfumeRedirectVerifier::RESULT_OK) {
                $okImpressions += $gsc;
            } else {
                $failedImpressions += $gsc;
                $failures[] = $row;
            }
        }

        $this->line("GSC impressions on ok rows: {$okImpressions}");
        $this->line("GSC impressions on failed rows: {$failedImpressions}");

        usort($failures, static function (array $a, array $b): int {
            return ((int) ($b['gsc_impressions'] ?? 0)) <=> ((int) ($a['gsc_impressions'] ?? 0));
        });
        $top = array_slice($failures, 0, 20);
        if ($top !== []) {
            $this->warn('Top failures by GSC impressions:');
            foreach ($top as $row) {
                $this->line(sprintf(
                    '  %s impressions=%s result=%s location=%s',
                    $row['old_path'] ?? '',
                    $row['gsc_impressions'] ?? '0',
                    $row['result'] ?? '',
                    $row['location'] ?? '',
                ));
            }
        }

        return $failedImpressions > 0 ? self::FAILURE : self::SUCCESS;
    }
}

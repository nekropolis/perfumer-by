<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Modules\ImportExport\Support\ElParfume\ElParfumeRedirectVerifier;
use Tests\TestCase;

class ElParfumeVerifyRedirectsCommandTest extends TestCase
{
    private string $dir = '';

    private string $inPath = '';

    private string $outPath = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->skipUnlessSqliteDriver();

        $this->dir = sys_get_temp_dir().'/elparfume-verify-'.uniqid('', true);
        mkdir($this->dir);
        $this->inPath = $this->dir.'/redirect_map.csv';
        $this->outPath = $this->dir.'/verify_report.csv';
    }

    protected function tearDown(): void
    {
        $this->removeTree($this->dir);
        parent::tearDown();
    }

    public function test_reports_ok_wrong_target_multi_hop_and_target_not_200(): void
    {
        Http::fake(function ($request) {
            $url = $request->url();

            return match (true) {
                str_ends_with($url, '/robots.txt') => Http::response('User-agent: *', 200),
                str_ends_with($url, '/sitemap.xml') => Http::response('', 301, ['Location' => 'https://perfumer.by/sitemap.xml']),
                $url === 'https://el-parfume.by/ok/' => Http::response('', 301, ['Location' => 'https://perfumer.by/ok-target']),
                $url === 'https://perfumer.by/ok-target' => Http::response('ok', 200),
                $url === 'https://el-parfume.by/wrong/' => Http::response('', 301, ['Location' => 'https://perfumer.by/bad-target']),
                $url === 'https://el-parfume.by/multi/' => Http::response('', 301, ['Location' => 'https://perfumer.by/hop-a']),
                $url === 'https://perfumer.by/hop-a' => Http::response('', 301, ['Location' => 'https://perfumer.by/hop-b']),
                $url === 'https://perfumer.by/hop-b' => Http::response('', 301, ['Location' => 'https://perfumer.by/hop-c']),
                $url === 'https://el-parfume.by/missing/' => Http::response('', 301, ['Location' => 'https://perfumer.by/missing-target']),
                $url === 'https://perfumer.by/missing-target' => Http::response('gone', 404),
                default => Http::response('unexpected', 500),
            };
        });

        $this->writeFixture([
            $this->redirectRow('/ok/', '/ok-target', '100'),
            $this->redirectRow('/wrong/', '/expected-target', '0'),
            $this->redirectRow('/multi/', '/hop-a', '0'),
            $this->redirectRow('/missing/', '/missing-target', '50'),
        ]);

        $exit = Artisan::call('elparfume:verify-redirects', [
            '--in' => $this->inPath,
            '--out' => $this->outPath,
            '--old-host' => 'https://el-parfume.by',
            '--new-host' => 'https://perfumer.by',
            '--concurrency' => 2,
        ]);

        $this->assertSame(1, $exit);
        $report = $this->readReport();
        $this->assertSame([
            'ok' => 1,
            'wrong_target' => 1,
            ElParfumeRedirectVerifier::RESULT_MULTI_HOP => 1,
            ElParfumeRedirectVerifier::RESULT_TARGET_NOT_200 => 1,
        ], $this->countResults($report));

        $byPath = [];
        foreach ($report as $row) {
            $byPath[$row['old_path']] = $row;
        }

        $this->assertSame(ElParfumeRedirectVerifier::RESULT_OK, $byPath['/ok/']['result']);
        $this->assertSame('200', $byPath['/ok/']['target_status']);

        $this->assertSame(ElParfumeRedirectVerifier::RESULT_WRONG_TARGET, $byPath['/wrong/']['result']);
        $this->assertSame('https://perfumer.by/bad-target', $byPath['/wrong/']['location']);

        $this->assertSame(ElParfumeRedirectVerifier::RESULT_MULTI_HOP, $byPath['/multi/']['result']);
        $this->assertStringContainsString('https://perfumer.by/hop-a', $byPath['/multi/']['error']);
        $this->assertStringContainsString('https://perfumer.by/hop-b', $byPath['/multi/']['error']);

        $this->assertSame(ElParfumeRedirectVerifier::RESULT_TARGET_NOT_200, $byPath['/missing/']['result']);
        $this->assertSame('404', $byPath['/missing/']['target_status']);

        $output = Artisan::output();
        $this->assertStringContainsString('GSC impressions on ok rows: 100', $output);
        $this->assertStringContainsString('GSC impressions on failed rows: 50', $output);
        $this->assertStringContainsString('/missing/', $output);
    }

    /**
     * @param  list<array<string, string>>  $rows
     */
    private function writeFixture(array $rows): void
    {
        $columns = [
            'old_path', 'type', 'old_id', 'url_form', 'target', 'method', 'decision',
            'score', 'slug_score', 'name_score', 'old_name', 'our_id', 'our_name',
            'cand2', 'cand3', 'gsc_impressions', 'note',
        ];
        $handle = fopen($this->inPath, 'wb');
        fputcsv($handle, $columns);
        foreach ($rows as $row) {
            $line = [];
            foreach ($columns as $column) {
                $line[] = $row[$column] ?? '';
            }
            fputcsv($handle, $line);
        }
        fclose($handle);
    }

    /**
     * @return array<string, string>
     */
    private function redirectRow(string $oldPath, string $target, string $gsc): array
    {
        return [
            'old_path' => $oldPath,
            'type' => 'seo',
            'old_id' => '1',
            'url_form' => 'seo',
            'target' => $target,
            'method' => 'test',
            'decision' => 'auto',
            'score' => '0',
            'slug_score' => '0',
            'name_score' => '0',
            'old_name' => '',
            'our_id' => '',
            'our_name' => '',
            'cand2' => '',
            'cand3' => '',
            'gsc_impressions' => $gsc,
            'note' => '',
        ];
    }

    /**
     * @return list<array<string, string>>
     */
    private function readReport(): array
    {
        $handle = fopen($this->outPath, 'rb');
        $this->assertNotFalse($handle);
        $header = fgetcsv($handle);
        $this->assertIsArray($header);
        $rows = [];
        while (($line = fgetcsv($handle)) !== false) {
            if (! is_array($line)) {
                continue;
            }
            $row = [];
            foreach ($header as $idx => $column) {
                $row[(string) $column] = (string) ($line[$idx] ?? '');
            }
            $rows[] = $row;
        }
        fclose($handle);

        return $rows;
    }

    /**
     * @param  list<array<string, string>>  $report
     * @return array<string, int>
     */
    private function countResults(array $report): array
    {
        $counts = [];
        foreach ($report as $row) {
            $result = $row['result'] ?? '';
            $counts[$result] = ($counts[$result] ?? 0) + 1;
        }
        return $counts;
    }

    private function removeTree(string $dir): void
    {
        if ($dir === '' || ! is_dir($dir)) {
            return;
        }
        $items = scandir($dir);
        if ($items === false) {
            return;
        }
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $path = $dir.'/'.$item;
            if (is_dir($path)) {
                $this->removeTree($path);
            } else {
                @unlink($path);
            }
        }
        @rmdir($dir);
    }
}

<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Artisan;
use Modules\ImportExport\Support\ElParfume\ElParfumeNginxMapBuilder;
use Tests\TestCase;

class ElParfumeBuildNginxMapCommandTest extends TestCase
{
    private string $dir = '';

    private string $inPath = '';

    private string $outDir = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->dir = sys_get_temp_dir().'/elparfume-nginx-'.uniqid('', true);
        mkdir($this->dir);
        $this->inPath = $this->dir.'/redirect_map.csv';
        $this->outDir = $this->dir.'/nginx';
    }

    protected function tearDown(): void
    {
        $this->removeTree($this->dir);
        parent::tearDown();
    }

    public function test_builds_map_with_slash_variants_index_php_escaping_and_duplicates(): void
    {
        $this->writeFixture([
            $this->redirectRow('/zara-462/', 'seo', '/zara-wonder-rose', 'auto'),
            $this->redirectRow('/', 'seo', '/', 'static'),
            $this->redirectRow(
                '/index.php?route=product/product&product_id=224',
                'product',
                '/zara-wonder-rose',
                'auto',
                'index_php'
            ),
            $this->redirectRow('/woman/my brand/', 'seo', '/catalog?gender=female', 'static'),
            $this->redirectRow('/woman/my"quote/', 'seo', '/brands/zara', 'review'),
            $this->redirectRow('/woman/my"quote', 'seo', '/catalog', 'fallback'),
            $this->redirectRow('/dup/', 'seo', '/winner', 'auto'),
            $this->redirectRow('/dup/', 'seo', '/loser', 'static'),
        ]);

        $exit = Artisan::call('elparfume:build-nginx-map', [
            '--in' => $this->inPath,
            '--out-dir' => $this->outDir,
            '--host' => 'https://perfumer.by',
        ]);

        $this->assertSame(0, $exit);
        $map = file_get_contents($this->outDir.'/el-parfume.by.map.conf');
        $this->assertIsString($map);

        $this->assertStringContainsString('"/zara-462/" "/zara-wonder-rose";', $map);
        $this->assertStringContainsString('"/zara-462" "/zara-wonder-rose";', $map);
        $this->assertStringContainsString('"/" "/";', $map);
        $this->assertStringContainsString(
            '"route=product/product&product_id=224" "/zara-wonder-rose";',
            $map
        );
        $this->assertStringContainsString('"/woman/my brand/" "/catalog?gender=female";', $map);
        $this->assertStringContainsString('"/woman/my brand" "/catalog?gender=female";', $map);
        $this->assertStringContainsString('"/woman/my\"quote/" "/brands/zara";', $map);
        $this->assertStringContainsString('"/dup/" "/winner";', $map);
        $this->assertStringContainsString('"/dup" "/winner";', $map);
        $this->assertStringNotContainsString('"/loser"', $map);

        $output = Artisan::output();
        $this->assertStringContainsString('Duplicate map keys skipped', $output);

        $server = file_get_contents($this->outDir.'/el-parfume.by.conf.example');
        $this->assertIsString($server);
        $this->assertStringContainsString('return 301 https://perfumer.by$elp_target_path;', $server);
        $this->assertStringContainsString('return 301 https://perfumer.by$elp_target_args;', $server);

        $this->maybeNginxTest($map, $server);
    }

    public function test_fails_when_target_empty(): void
    {
        $this->writeFixture([
            $this->redirectRow('/broken/', 'seo', '', 'fallback'),
        ]);

        $exit = Artisan::call('elparfume:build-nginx-map', [
            '--in' => $this->inPath,
            '--out-dir' => $this->outDir,
        ]);

        $this->assertSame(1, $exit);
        $this->assertStringContainsString('empty target', Artisan::output());
        $this->assertFileDoesNotExist($this->outDir.'/el-parfume.by.map.conf');
    }

    public function test_builder_uri_keys_decode_percent_encoding(): void
    {
        $builder = new ElParfumeNginxMapBuilder();
        $result = $builder->build([
            $this->redirectRow('/woman%20zara/', 'seo', '/brands/zara', 'auto'),
        ], 'https://perfumer.by', '/etc/nginx/el-parfume.by.map.conf');

        $this->assertStringContainsString('"/woman zara/" "/brands/zara";', $result['map_conf']);
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
    private function redirectRow(
        string $oldPath,
        string $type,
        string $target,
        string $decision,
        string $urlForm = 'seo',
    ): array {
        return [
            'old_path' => $oldPath,
            'type' => $type,
            'old_id' => '1',
            'url_form' => $urlForm,
            'target' => $target,
            'method' => 'test',
            'decision' => $decision,
            'score' => '0',
            'slug_score' => '0',
            'name_score' => '0',
            'old_name' => '',
            'our_id' => '',
            'our_name' => '',
            'cand2' => '',
            'cand3' => '',
            'gsc_impressions' => '0',
            'note' => '',
        ];
    }

    private function maybeNginxTest(string $mapConf, string $serverConf): void
    {
        $nginx = trim((string) shell_exec('which nginx 2>/dev/null'));
        if ($nginx === '') {
            $this->addToAssertionCount(1);

            return;
        }

        $confDir = $this->dir.'/nginx-test';
        mkdir($confDir);
        $mapPath = $confDir.'/map.conf';
        $sitePath = $confDir.'/site.conf';
        $mainPath = $confDir.'/nginx.conf';

        file_put_contents($mapPath, $mapConf);
        file_put_contents($sitePath, $serverConf);
        file_put_contents($mainPath, <<<NGINX
events {}
http {
    include {$mapPath};
    include {$sitePath};
}
NGINX);

        $cmd = escapeshellcmd($nginx).' -t -c '.escapeshellarg($mainPath).' 2>&1';
        exec($cmd, $output, $code);
        $this->assertSame(0, $code, implode("\n", $output));
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

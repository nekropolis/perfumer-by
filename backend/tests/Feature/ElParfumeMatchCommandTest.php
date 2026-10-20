<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ElParfumeMatchCommandTest extends TestCase
{
    private string $inPath = '';

    private string $outPath = '';

    private string $unmatchedPath = '';

    private string $synonymsPath = '';

    private string $overridesPath = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->skipUnlessSqliteDriver();

        Schema::create('brands', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::create('products', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('brand_id')->nullable();
            $table->string('name');
            $table->string('slug')->unique();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        $dir = sys_get_temp_dir().'/elparfume-match-'.uniqid('', true);
        mkdir($dir);
        $this->inPath = $dir.'/in.csv';
        $this->outPath = $dir.'/out.csv';
        $this->unmatchedPath = $dir.'/unmatched.csv';
        $this->synonymsPath = $dir.'/synonyms.csv';
        $this->overridesPath = $dir.'/overrides.csv';
    }

    protected function tearDown(): void
    {
        if ($this->sqliteDriverAvailable()) {
            Schema::dropIfExists('products');
            Schema::dropIfExists('brands');
        }
        foreach ([$this->inPath, $this->outPath, $this->unmatchedPath, $this->synonymsPath, $this->overridesPath] as $path) {
            if ($path !== '' && is_file($path)) {
                @unlink($path);
            }
        }
        if ($this->inPath !== '') {
            @rmdir(dirname($this->inPath));
        }

        parent::tearDown();
    }

    public function test_exact_slug_match(): void
    {
        $this->brand(1, 'Chanel', 'chanel');
        $this->product(10, 1, 'Day', 'sauvage');

        $rows = $this->match([
            $this->row([
                'old_path' => '/sauvage/',
                'type' => 'product',
                'old_id' => '10',
                'keyword_raw' => 'sauvage',
                'name' => 'Night',
                'brand_name' => 'Chanel',
            ]),
        ]);

        $row = $this->find($rows, 'product', 'seo', '/sauvage/');
        $this->assertSame('/sauvage', $row['target']);
        $this->assertSame('exact_slug', $row['method']);
        $this->assertSame('auto', $row['decision']);
        $this->assertSame('10', $row['our_id']);
    }

    public function test_exact_name_wins_when_slug_differs(): void
    {
        $this->brand(1, 'Chanel', 'chanel');
        $this->product(11, 1, 'Bleu de Chanel', 'bleu-de-chanel');

        $rows = $this->match([
            $this->row([
                'old_path' => '/legacy-bleu/',
                'type' => 'product',
                'old_id' => '11',
                'keyword_raw' => 'legacy-bleu',
                'name' => 'Bleu de Chanel',
                'brand_name' => 'Chanel',
            ]),
        ]);

        $row = $this->find($rows, 'product', 'seo', '/legacy-bleu/');
        $this->assertSame('/bleu-de-chanel', $row['target']);
        $this->assertSame('exact_name', $row['method']);
        $this->assertSame('auto', $row['decision']);
    }

    public function test_fuzzy_l_homme_matches_lhomme(): void
    {
        $this->brand(1, 'Guerlain', 'guerlain');
        $this->product(12, 1, 'Another Name', 'lhomme');

        $rows = $this->match([
            $this->row([
                'old_path' => '/l-homme/',
                'type' => 'product',
                'old_id' => '12',
                'keyword_raw' => 'l-homme',
                'name' => 'Different Name',
                'brand_name' => 'Guerlain',
            ]),
        ]);

        $row = $this->find($rows, 'product', 'seo', '/l-homme/');
        $this->assertSame('/lhomme', $row['target']);
        $this->assertSame('fuzzy_slug', $row['method']);
        $this->assertSame('auto', $row['decision']);
        $this->assertSame('1.0000', $row['score']);
    }

    public function test_eros_versus_eros_flame_ambiguity_is_review(): void
    {
        $this->brand(5, 'Versace', 'versace');
        $this->product(1, 5, 'Eros', 'eros');
        $this->product(2, 5, 'Eros Flame', 'eros-flame');
        $this->product(3, 5, 'Eros Flamo', 'eros-flamo');

        $rows = $this->match([
            $this->row([
                'old_path' => '/eros/',
                'type' => 'product',
                'old_id' => '1',
                'keyword_raw' => 'eros',
                'name' => 'Eros',
                'brand_name' => 'Versace',
                'gsc_impressions' => '3',
            ]),
            $this->row([
                'old_path' => '/eros-flami/',
                'type' => 'product',
                'old_id' => '2',
                'keyword_raw' => 'eros-flami',
                'name' => 'Eros Flami',
                'brand_name' => 'Versace',
                'gsc_impressions' => '40',
            ]),
        ]);

        $exact = $this->find($rows, 'product', 'seo', '/eros/');
        $this->assertSame('/eros', $exact['target']);
        $this->assertSame('auto', $exact['decision']);
        $this->assertSame('exact_name', $exact['method']);

        $ambiguous = $this->find($rows, 'product', 'seo', '/eros-flami/');
        $this->assertSame('review', $ambiguous['decision'], json_encode($ambiguous));
        $this->assertSame('ambiguous', $ambiguous['note']);
        $this->assertContains($ambiguous['target'], ['/eros-flame', '/eros-flamo']);
        $this->assertNotSame('', $ambiguous['cand2']);

        $unmatched = $this->readCsv($this->unmatchedPath);
        $paths = array_column($unmatched, 'old_path');
        $this->assertSame(['/eros-flami/'], $paths);
        $this->assertStringContainsString('|', $unmatched[0]['cand1']);
    }

    public function test_brand_id_suffix_matches_clean_brand_url(): void
    {
        $this->brand(4, 'Zara', 'zara');

        $rows = $this->match([
            $this->row([
                'old_path' => '/zara-462/',
                'type' => 'manufacturer',
                'old_id' => '462',
                'keyword_raw' => 'zara-462',
                'name' => 'Zara',
            ]),
        ]);

        $row = $this->find($rows, 'manufacturer', 'seo', '/zara-462/');
        $this->assertSame('/brands/zara', $row['target']);
        $this->assertSame('auto', $row['decision']);
        $this->assertStringNotContainsString('?', $row['target']);
    }

    public function test_inactive_product_targets_brand_and_keeps_product_id(): void
    {
        $this->brand(4, 'Zara', 'zara');
        $this->product(77, 4, 'Zara Femme', 'zara-femme', false);

        $rows = $this->match([
            $this->row([
                'old_path' => '/zara-femme/',
                'type' => 'product',
                'old_id' => '77',
                'keyword_raw' => 'zara-femme',
                'name' => 'Zara Femme',
                'brand_name' => 'Zara',
            ]),
        ]);

        $row = $this->find($rows, 'product', 'seo', '/zara-femme/');
        $this->assertSame('/brands/zara', $row['target']);
        $this->assertSame('fallback_brand', $row['method']);
        $this->assertSame('fallback', $row['decision']);
        $this->assertSame('77', $row['our_id']);
        $this->assertStringNotContainsString('gender', $row['target']);
    }

    public function test_unknown_brand_falls_back_to_catalog(): void
    {
        $this->brand(4, 'Zara', 'zara');

        $rows = $this->match([
            $this->row([
                'old_path' => '/qqqqqqqqq-scent/',
                'type' => 'product',
                'old_id' => '9',
                'keyword_raw' => 'qqqqqqqqq-scent',
                'name' => 'Qqqqqqqqq Scent',
                'brand_name' => 'Qqqqqqqqq',
            ]),
        ]);

        $row = $this->find($rows, 'product', 'seo', '/qqqqqqqqq-scent/');
        $this->assertSame('/catalog', $row['target']);
        $this->assertSame('fallback_catalog', $row['method']);
        $this->assertSame('fallback', $row['decision']);

        $unmatched = $this->readCsv($this->unmatchedPath);
        $this->assertSame('/qqqqqqqqq-scent/', $unmatched[0]['old_path']);
    }

    public function test_category_brand_page_has_no_gender_and_root_uses_catalog(): void
    {
        $this->brand(4, 'Zara', 'zara');

        $rows = $this->match([
            $this->row([
                'old_path' => '/woman/zara/',
                'type' => 'category',
                'old_id' => '100',
                'keyword_raw' => 'zara',
                'name' => 'Zara',
                'gender_hint' => 'female',
            ]),
            $this->row([
                'old_path' => '/woman/',
                'type' => 'category',
                'old_id' => '50',
                'keyword_raw' => 'woman',
                'name' => 'Женский парфюм',
                'gender_hint' => 'female',
            ]),
        ]);

        $zara = $this->find($rows, 'category', 'seo', '/woman/zara/');
        $this->assertSame('/brands/zara', $zara['target']);
        $this->assertSame('auto', $zara['decision']);
        $this->assertStringNotContainsString('gender', $zara['target']);

        $root = $this->find($rows, 'category', 'seo', '/woman/');
        $this->assertSame('/catalog?gender=female', $root['target']);
        $this->assertSame('static', $root['method']);
        $this->assertSame('static', $root['decision']);
    }

    public function test_seo_filter_is_pending_landing_and_cart_is_static(): void
    {
        $rows = $this->match([
            $this->row([
                'old_path' => '/man/filter/aromat/',
                'type' => 'seo_filter',
                'old_id' => '125',
                'name' => 'Древесные духи',
                'gender_hint' => 'male',
                'gsc_impressions' => '7',
            ]),
            $this->row([
                'old_path' => '/cart/',
                'type' => 'system',
                'old_id' => '',
                'keyword_raw' => 'cart',
                'name' => 'checkout/cart',
            ]),
        ]);

        $filter = $this->find($rows, 'seo_filter', 'seo', '/man/filter/aromat/');
        $this->assertSame('/catalog?gender=male', $filter['target']);
        $this->assertSame('pending_landing', $filter['method']);
        $this->assertSame('static', $filter['decision']);
        $this->assertSame('7', $filter['gsc_impressions']);

        $cart = $this->find($rows, 'system', 'seo', '/cart/');
        $this->assertSame('/cart', $cart['target']);
        $this->assertSame('static', $cart['method']);
        $this->assertSame('static', $cart['decision']);
    }

    public function test_override_wins(): void
    {
        $this->brand(4, 'Zara', 'zara');
        file_put_contents($this->overridesPath, "old_path,target\n/zara-462/,/manual-target\n");

        $rows = $this->match([
            $this->row([
                'old_path' => '/zara-462/',
                'type' => 'manufacturer',
                'old_id' => '462',
                'keyword_raw' => 'zara-462',
                'name' => 'Zara',
            ]),
        ], $this->overridesPath);

        $row = $this->find($rows, 'manufacturer', 'seo', '/zara-462/');
        $this->assertSame('/manual-target', $row['target']);
        $this->assertSame('override', $row['method']);
        $this->assertSame('auto', $row['decision']);
    }

    public function test_index_php_row_mirrors_seo_row(): void
    {
        $this->brand(1, 'Dior', 'dior');
        $this->product(15, 1, 'Sauvage', 'sauvage');

        $rows = $this->match([
            $this->row([
                'old_path' => '/sauvage/',
                'type' => 'product',
                'old_id' => '15',
                'url_form' => 'seo',
                'keyword_raw' => 'sauvage',
                'name' => 'Sauvage',
                'brand_name' => 'Dior',
            ]),
            $this->row([
                'old_path' => '/index.php?route=product/product&product_id=15',
                'type' => 'product',
                'old_id' => '15',
                'url_form' => 'index_php',
                'keyword_raw' => '',
                'name' => 'Totally Different Unrelated',
                'brand_name' => 'Dior',
            ]),
        ]);

        $this->assertCount(2, $rows);
        $seo = $this->find($rows, 'product', 'seo', '/sauvage/');
        $index = $this->find($rows, 'product', 'index_php', '/index.php?route=product/product&product_id=15');
        $this->assertSame('/sauvage', $seo['target']);
        $this->assertSame($seo['target'], $index['target']);
        $this->assertSame($seo['method'], $index['method']);
        $this->assertSame($seo['decision'], $index['decision']);
        $this->assertSame($seo['our_id'], $index['our_id']);
        $this->assertSame('15', $index['our_id']);
    }

    /**
     * @param  list<array<string, string>>  $inputRows
     * @return list<array<string, string>>
     */
    private function match(array $inputRows, ?string $overridesPath = null): array
    {
        $this->writeCsv($this->inPath, array_keys($inputRows[0]), $inputRows);
        $exit = Artisan::call('elparfume:match', [
            '--in' => $this->inPath,
            '--out' => $this->outPath,
            '--unmatched' => $this->unmatchedPath,
            '--synonyms' => $this->synonymsPath,
            '--overrides' => $overridesPath ?? $this->overridesPath,
        ]);
        $this->assertSame(0, $exit, Artisan::output());

        $rows = $this->readCsv($this->outPath);
        $this->assertSame([
            'old_path', 'type', 'old_id', 'url_form', 'target', 'method', 'decision',
            'score', 'slug_score', 'name_score', 'old_name', 'our_id', 'our_name',
            'cand2', 'cand3', 'gsc_impressions', 'note',
        ], $this->headerOf($this->outPath));
        $this->assertCount(count($inputRows), $rows);

        return $rows;
    }

    private function brand(int $id, string $name, string $slug, bool $active = true): void
    {
        DB::table('brands')->insert([
            'id' => $id,
            'name' => $name,
            'slug' => $slug,
            'is_active' => $active ? 1 : 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function product(int $id, int $brandId, string $name, string $slug, bool $active = true): void
    {
        DB::table('products')->insert([
            'id' => $id,
            'brand_id' => $brandId,
            'name' => $name,
            'slug' => $slug,
            'is_active' => $active ? 1 : 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * @param  array<string, string>  $overrides
     * @return array<string, string>
     */
    private function row(array $overrides): array
    {
        return array_merge([
            'old_path' => '/',
            'type' => 'product',
            'old_id' => '1',
            'url_form' => 'seo',
            'keyword_raw' => '',
            'name' => '',
            'h1' => '',
            'brand_old_id' => '',
            'brand_name' => '',
            'gender_hint' => '',
            'status' => '1',
            'volumes' => '',
            'gsc_impressions' => '',
        ], $overrides);
    }

    /**
     * @param  list<array<string, string>>  $rows
     * @return array<string, string>
     */
    private function find(array $rows, string $type, string $urlForm, string $oldPath): array
    {
        foreach ($rows as $row) {
            if ($row['type'] === $type && $row['url_form'] === $urlForm && $row['old_path'] === $oldPath) {
                return $row;
            }
        }

        $this->fail('Row not found: '.$type.' '.$urlForm.' '.$oldPath);
    }

    /**
     * @param  list<string>  $header
     * @param  list<array<string, string>>  $rows
     */
    private function writeCsv(string $path, array $header, array $rows): void
    {
        $handle = fopen($path, 'wb');
        $this->assertNotFalse($handle);
        fputcsv($handle, $header);
        foreach ($rows as $row) {
            $line = [];
            foreach ($header as $column) {
                $line[] = $row[$column] ?? '';
            }
            fputcsv($handle, $line);
        }
        fclose($handle);
    }

    /**
     * @return list<string>
     */
    private function headerOf(string $path): array
    {
        $handle = fopen($path, 'rb');
        $this->assertNotFalse($handle);
        $header = fgetcsv($handle);
        fclose($handle);
        $this->assertIsArray($header);

        return array_map(static fn ($column): string => (string) $column, $header);
    }

    /**
     * @return list<array<string, string>>
     */
    private function readCsv(string $path): array
    {
        $handle = fopen($path, 'rb');
        $this->assertNotFalse($handle);
        $header = fgetcsv($handle);
        $this->assertIsArray($header);
        $rows = [];
        while (($row = fgetcsv($handle)) !== false) {
            $rows[] = array_combine($header, $row);
        }
        fclose($handle);

        return $rows;
    }
}

<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\Catalog\Models\CatalogLanding;
use Tests\TestCase;

class ElParfumeImportLandingsCommandTest extends TestCase
{
    private string $dir = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->skipUnlessSqliteDriver();
        $this->createSchema();

        $this->dir = sys_get_temp_dir().'/elparfume-landings-'.uniqid('', true);
        mkdir($this->dir);
        file_put_contents($this->dir.'/dump.sql', $this->dumpSql());
        file_put_contents($this->dir.'/urls.csv', $this->urlsCsv());
        file_put_contents($this->dir.'/map.csv', implode("\n", [
            'old_path,target',
            '/old-product/,/our-product',
            '/man/,/catalog?gender=male',
        ]));
        file_put_contents($this->dir.'/overrides.csv', implode("\n", [
            'old_path,target',
            '/keep-me/,/stay',
        ]));

        DB::table('product_attribute_options')->insert([
            ['id' => 100, 'product_attribute_id' => 8, 'name' => 'Лето', 'is_active' => 1],
            ['id' => 101, 'product_attribute_id' => 8, 'name' => 'Зима', 'is_active' => 1],
        ]);
        DB::table('products')->insert([
            ['id' => 1, 'is_active' => 1],
            ['id' => 2, 'is_active' => 0],
        ]);
        DB::table('product_attribute_values')->insert([
            ['id' => 1, 'product_id' => 1, 'product_attribute_id' => 2],
            ['id' => 2, 'product_id' => 1, 'product_attribute_id' => 8],
            ['id' => 3, 'product_id' => 2, 'product_attribute_id' => 2],
            ['id' => 4, 'product_id' => 2, 'product_attribute_id' => 8],
        ]);
        DB::table('product_attribute_value_options')->insert([
            ['product_attribute_value_id' => 1, 'product_attribute_option_id' => 2],
            ['product_attribute_value_id' => 2, 'product_attribute_option_id' => 100],
            ['product_attribute_value_id' => 3, 'product_attribute_option_id' => 2],
            ['product_attribute_value_id' => 4, 'product_attribute_option_id' => 101],
        ]);
    }

    protected function tearDown(): void
    {
        if ($this->sqliteDriverAvailable()) {
            Schema::dropIfExists('catalog_landings');
            Schema::dropIfExists('product_attribute_value_options');
            Schema::dropIfExists('product_attribute_values');
            Schema::dropIfExists('product_attribute_options');
            Schema::dropIfExists('products');
        }
        if ($this->dir !== '' && is_dir($this->dir)) {
            foreach (glob($this->dir.'/*') ?: [] as $file) {
                @unlink($file);
            }
            @rmdir($this->dir);
        }

        parent::tearDown();
    }

    public function test_mapped_landing_fallback_and_idempotent_rerun(): void
    {
        $exit = $this->import();
        $this->assertSame(0, $exit, Artisan::output());

        $this->assertSame(1, CatalogLanding::query()->count());
        $landing = CatalogLanding::query()->where('slug', 'zhenskie-duhi-na-leto')->first();
        $this->assertNotNull($landing);
        $this->assertSame('female', $landing->gender);
        $this->assertSame(['8' => [100]], $landing->filters);
        $this->assertSame('Женские духи на лето', $landing->h1);
        $this->assertSame('SEO title', $landing->seo_title);
        $this->assertSame('SEO description', $landing->seo_description);
        $this->assertTrue($landing->is_active);
        $this->assertStringContainsString('href="/our-product"', (string) $landing->content);
        $this->assertStringContainsString('/catalog?gender=male', (string) $landing->content);
        $this->assertStringNotContainsString('el-parfume.by', (string) $landing->content);
        $this->assertNull(CatalogLanding::query()->where('slug', 'zhenskie-duhi-na-zimu')->first());

        $report = $this->readCsv($this->dir.'/report.csv');
        $byPath = [];
        foreach ($report as $row) {
            $byPath[$row['old_path']] = $row;
        }
        $this->assertSame('created', $byPath['/woman/filter/vremya_goda_60/leto_60/']['action']);
        $this->assertSame('/catalog/zhenskie-duhi-na-leto', $byPath['/woman/filter/vremya_goda_60/leto_60/']['target']);
        $this->assertSame('100', $byPath['/woman/filter/vremya_goda_60/leto_60/']['option_id']);
        $this->assertSame('1', $byPath['/woman/filter/vremya_goda_60/leto_60/']['products']);
        $this->assertSame('fallback', $byPath['/woman/filter/vozrast_69/ot_15_do_25_let_69/']['action']);
        $this->assertSame('/catalog?gender=female', $byPath['/woman/filter/vozrast_69/ot_15_do_25_let_69/']['target']);
        $this->assertSame('unmapped_group', $byPath['/woman/filter/vozrast_69/ot_15_do_25_let_69/']['note']);
        $this->assertSame('', $byPath['/woman/filter/vozrast_69/ot_15_do_25_let_69/']['attr_id']);
        $this->assertSame('fallback', $byPath['/woman/filter/vremya_goda_60/zima_60/']['action']);
        $this->assertSame('no_products', $byPath['/woman/filter/vremya_goda_60/zima_60/']['note']);
        $this->assertArrayNotHasKey('/woman/filter/aromat_79/drevesnye_79/', $byPath);

        $overrides = $this->readCsv($this->dir.'/overrides.csv');
        $targets = [];
        foreach ($overrides as $row) {
            $targets[$row['old_path']] = $row['target'];
        }
        $this->assertSame('/stay', $targets['/keep-me/']);
        $this->assertSame('/catalog/zhenskie-duhi-na-leto', $targets['/woman/filter/vremya_goda_60/leto_60/']);
        $this->assertSame('/catalog?gender=female', $targets['/woman/filter/vozrast_69/ot_15_do_25_let_69/']);
        $this->assertCount(4, $overrides);

        CatalogLanding::query()->where('slug', 'zhenskie-duhi-na-leto')->update([
            'h1' => 'Ручной заголовок',
        ]);

        $exit = $this->import();
        $this->assertSame(0, $exit, Artisan::output());
        $this->assertSame(1, CatalogLanding::query()->count());
        $this->assertSame('Ручной заголовок', CatalogLanding::query()->value('h1'));

        $report = $this->readCsv($this->dir.'/report.csv');
        $leto = null;
        foreach ($report as $row) {
            if ($row['old_path'] === '/woman/filter/vremya_goda_60/leto_60/') {
                $leto = $row;
            }
        }
        $this->assertNotNull($leto);
        $this->assertSame('skipped_existing', $leto['action']);
        $this->assertCount(4, $this->readCsv($this->dir.'/overrides.csv'));

        $exit = $this->import(force: true);
        $this->assertSame(0, $exit, Artisan::output());
        $this->assertSame('Женские духи на лето', CatalogLanding::query()->value('h1'));
        $report = $this->readCsv($this->dir.'/report.csv');
        $leto = null;
        foreach ($report as $row) {
            if ($row['old_path'] === '/woman/filter/vremya_goda_60/leto_60/') {
                $leto = $row;
            }
        }
        $this->assertNotNull($leto);
        $this->assertSame('updated', $leto['action']);
    }

    public function test_dry_run_writes_nothing(): void
    {
        $exit = $this->import(true);
        $this->assertSame(0, $exit, Artisan::output());
        $this->assertSame(0, CatalogLanding::query()->count());
        $this->assertFileDoesNotExist($this->dir.'/report.csv');

        $overrides = file_get_contents($this->dir.'/overrides.csv');
        $this->assertIsString($overrides);
        $this->assertStringContainsString('/keep-me/', $overrides);
        $this->assertStringNotContainsString('zhenskie-duhi-na-leto', $overrides);
        $this->assertStringNotContainsString('vozrast', $overrides);
    }

    private function import(bool $dryRun = false, bool $force = false): int
    {
        $params = [
            '--dump' => $this->dir.'/dump.sql',
            '--urls' => $this->dir.'/urls.csv',
            '--map' => $this->dir.'/map.csv',
            '--overrides' => $this->dir.'/overrides.csv',
            '--report' => $this->dir.'/report.csv',
        ];
        if ($dryRun) {
            $params['--dry-run'] = true;
        }
        if ($force) {
            $params['--force'] = true;
        }

        return Artisan::call('elparfume:import-landings', $params);
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
        while (($line = fgetcsv($handle)) !== false) {
            $rows[] = array_combine($header, $line);
        }
        fclose($handle);

        return $rows;
    }

    private function createSchema(): void
    {
        Schema::create('products', function (Blueprint $table): void {
            $table->id();
            $table->boolean('is_active')->default(true);
        });
        Schema::create('product_attribute_options', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('product_attribute_id');
            $table->string('name');
            $table->boolean('is_active')->default(true);
        });
        Schema::create('product_attribute_values', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('product_attribute_id');
        });
        Schema::create('product_attribute_value_options', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('product_attribute_value_id');
            $table->unsignedBigInteger('product_attribute_option_id');
        });
        Schema::create('catalog_landings', function (Blueprint $table): void {
            $table->id();
            $table->string('slug')->unique();
            $table->string('gender', 32)->nullable();
            $table->text('filters')->nullable();
            $table->string('h1');
            $table->string('seo_title');
            $table->text('seo_description')->nullable();
            $table->longText('content')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
        });
    }

    private function dumpSql(): string
    {
        return <<<'SQL'
CREATE TABLE `oc_oct_filter_product_seo` (
  `seo_id` int NOT NULL AUTO_INCREMENT,
  `status` tinyint(1) NOT NULL DEFAULT '1',
  `date_added` datetime NOT NULL,
  `date_modified` datetime NOT NULL,
  PRIMARY KEY (`seo_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_oct_filter_product_seo_description` (
  `seo_id` int NOT NULL,
  `language_id` int NOT NULL,
  `seo_url` text NOT NULL,
  `seo_title` varchar(255) NOT NULL,
  `seo_h1` varchar(255) NOT NULL,
  `seo_meta_description` varchar(255) NOT NULL,
  `seo_meta_keywords` varchar(255) NOT NULL,
  `seo_description` text NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_oct_filter_product_attribute` (
  `filter_attribute_id` int NOT NULL AUTO_INCREMENT,
  `attribute_id` int NOT NULL,
  `product_id` int NOT NULL,
  `attribute_group_id` int NOT NULL,
  `language_id` int NOT NULL,
  `attribute_value` text NOT NULL,
  `attribute_value_mod` text NOT NULL,
  `attribute_name` text NOT NULL,
  `attribute_name_mod` text NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`filter_attribute_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

INSERT INTO `oc_oct_filter_product_seo` VALUES (10,1,'2020-01-01 00:00:00','2020-01-01 00:00:00'),(11,1,'2020-01-01 00:00:00','2020-01-01 00:00:00'),(12,1,'2020-01-01 00:00:00','2020-01-01 00:00:00'),(13,1,'2020-01-01 00:00:00','2020-01-01 00:00:00');
INSERT INTO `oc_oct_filter_product_seo_description` VALUES (10,2,'woman/filter/vremya_goda_60/leto_60/','WRONG','WRONG H1','WRONG','',''),(10,1,'woman/filter/vremya_goda_60/leto_60/','SEO title','Женские духи на лето','SEO description','','&lt;p&gt;&lt;a href=&quot;https://el-parfume.by/old-product/&quot;&gt;Link&lt;/a&gt; https://el-parfume.by/man/&lt;/p&gt;'),(11,1,'woman/filter/vremya_goda_60/zima_60/','Зима','Женские духи на зиму','Зима meta','',''),(12,1,'woman/filter/vozrast_69/ot_15_do_25_let_69/','Возраст','Духи от 15 до 25','Возраст meta','',''),(13,1,'woman/filter/aromat_79/drevesnye_79/','Древесные','Древесные духи','Древесные meta','','');
INSERT INTO `oc_oct_filter_product_attribute` VALUES (1,60,1,7,1,'Лето','leto_60','Время года','vremya_goda',0),(2,60,1,7,1,'Зима','zima_60','Время года','vremya_goda',0),(3,69,1,7,1,'от 15 до 25 лет','ot_15_do_25_let_69','Возраст','vozrast',0);
SQL;
    }

    private function urlsCsv(): string
    {
        return implode("\n", [
            'old_path,type,old_id,url_form,keyword_raw,name,h1,brand_old_id,brand_name,gender_hint,status,volumes,gsc_impressions',
            '/woman/filter/vremya_goda_60/leto_60/,seo_filter,10,seo,,SEO title,Женские духи на лето,,,female,1,,12',
            '/woman/filter/vremya_goda_60/zima_60/,seo_filter,11,seo,,Зима,Женские духи на зиму,,,female,1,,3',
            '/woman/filter/vozrast_69/ot_15_do_25_let_69/,seo_filter,12,seo,,Возраст,Духи от 15 до 25,,,female,1,,5',
            '/woman/filter/aromat_79/drevesnye_79/,seo_filter,13,seo,,Древесные,Древесные духи,,,female,1,,',
        ]);
    }
}

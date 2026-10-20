<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\Reviews\Models\Review;
use Tests\TestCase;

class ElParfumeImportReviewsCommandTest extends TestCase
{
    private string $dumpPath = '';

    private string $mapPath = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->skipUnlessSqliteDriver();

        Schema::create('reviews', function (Blueprint $table): void {
            $table->id();
            $table->string('type', 32);
            $table->unsignedBigInteger('product_id')->nullable();
            $table->string('name', 120);
            $table->text('body');
            $table->unsignedTinyInteger('stars');
            $table->string('status', 32)->default('published');
            $table->timestamp('published_at')->nullable();
            $table->text('reply_text')->nullable();
            $table->timestamp('replied_at')->nullable();
            $table->timestamps();
        });
        Schema::create('products', function (Blueprint $table): void {
            $table->id();
            $table->string('slug')->nullable();
            $table->timestamps();
        });

        $dir = sys_get_temp_dir().'/elparfume-reviews-'.uniqid('', true);
        mkdir($dir);
        $this->dumpPath = $dir.'/dump.sql';
        $this->mapPath = $dir.'/map.csv';
    }

    protected function tearDown(): void
    {
        if ($this->sqliteDriverAvailable()) {
            Schema::dropIfExists('products');
            Schema::dropIfExists('reviews');
        }
        if ($this->dumpPath !== '' && is_file($this->dumpPath)) {
            @unlink($this->dumpPath);
        }
        if ($this->mapPath !== '' && is_file($this->mapPath)) {
            @unlink($this->mapPath);
        }
        if ($this->dumpPath !== '') {
            @rmdir(dirname($this->dumpPath));
        }

        parent::tearDown();
    }

    public function test_product_review_binding_pros_cons_status_and_idempotency(): void
    {
        DB::table('products')->insert(['id' => 42, 'slug' => 'bound', 'created_at' => now(), 'updated_at' => now()]);

        file_put_contents($this->dumpPath, $this->fixtureSql());
        file_put_contents($this->mapPath, implode("\n", [
            'old_path,type,old_id,url_form,target,method,decision,score,slug_score,name_score,old_name,our_id,our_name,cand2,cand3,gsc_impressions,note',
            '/p-auto/,product,100,seo,/bound,exact_slug,auto,1,1,1,Auto,42,Bound,,,0,',
            '/p-review/,product,101,seo,/missing,exact_slug,review,1,1,1,Review,,,,,0,',
        ]));

        Artisan::call('elparfume:import-reviews', [
            '--dump' => $this->dumpPath,
            '--map' => $this->mapPath,
        ]);

        $auto = DB::table('reviews')->where('name', 'Auto User')->first();
        $this->assertNotNull($auto);
        $this->assertSame(Review::TYPE_PRODUCT, $auto->type);
        $this->assertSame(42, (int) $auto->product_id);
        $this->assertSame(Review::STATUS_PUBLISHED, $auto->status);
        $this->assertStringContainsString('Достоинства: Smells great', (string) $auto->body);
        $this->assertStringNotContainsString('Недостатки: нет', (string) $auto->body);

        $lowStars = DB::table('reviews')->where('name', 'Low Stars')->first();
        $this->assertNotNull($lowStars);
        $this->assertSame(Review::STATUS_PENDING, $lowStars->status);
        $this->assertNull($lowStars->published_at);

        $inactive = DB::table('reviews')->where('name', 'Inactive')->first();
        $this->assertNotNull($inactive);
        $this->assertSame(Review::STATUS_PENDING, $inactive->status);

        $unmatched = DB::table('reviews')->where('name', 'Review User')->first();
        $this->assertNotNull($unmatched);
        $this->assertSame(Review::TYPE_STORE, $unmatched->type);
        $this->assertNull($unmatched->product_id);
        $this->assertStringStartsWith('Отзыв о товаре: Legacy Product', (string) $unmatched->body);

        $store = DB::table('reviews')->where('name', 'Store User')->first();
        $this->assertNotNull($store);
        $this->assertSame(Review::TYPE_STORE, $store->type);
        $this->assertSame('Thanks for shopping', (string) $store->reply_text);

        $this->assertNull(DB::table('reviews')->where('name', 'Ghost Extension')->first());

        $count = DB::table('reviews')->count();
        Artisan::call('elparfume:import-reviews', [
            '--dump' => $this->dumpPath,
            '--map' => $this->mapPath,
        ]);
        $this->assertSame($count, DB::table('reviews')->count());
    }

    private function fixtureSql(): string
    {
        return <<<'SQL'
CREATE TABLE `oc_product_description` (
  `product_id` int NOT NULL,
  `language_id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`product_id`,`language_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_review` (
  `review_id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `author` varchar(64) NOT NULL,
  `text` text NOT NULL,
  `rating` int NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT '0',
  `date_added` datetime NOT NULL,
  `date_modified` datetime NOT NULL,
  PRIMARY KEY (`review_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_oct_product_reviews` (
  `review_id` int NOT NULL,
  `admin_answer` text NOT NULL,
  `positive_text` text NOT NULL,
  `negative_text` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_oct_sreview_reviews` (
  `oct_sreview_review_id` int NOT NULL AUTO_INCREMENT,
  `author` varchar(64) NOT NULL,
  `text` text NOT NULL,
  `admin_text` text NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT '0',
  `avg_rating` int NOT NULL DEFAULT '0',
  `date_added` datetime NOT NULL,
  `date_modified` datetime NOT NULL,
  PRIMARY KEY (`oct_sreview_review_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

INSERT INTO `oc_product_description` VALUES (101,1,'Legacy Product');
INSERT INTO `oc_review` VALUES
(1,100,'Auto User','Main text',5,1,'2021-01-01 12:00:00','2021-01-02 12:00:00'),
(2,101,'Review User','Needs prefix',4,1,'2021-02-01 12:00:00','2021-02-02 12:00:00'),
(3,100,'Low Stars','Three stars',3,1,'2021-03-01 12:00:00','2021-03-02 12:00:00'),
(4,100,'Inactive','Hidden',5,0,'2021-04-01 12:00:00','2021-04-02 12:00:00');
INSERT INTO `oc_oct_product_reviews` VALUES
(1,'','Smells great','нет'),
(2,'','+','-'),
(99,'','Ghost','Ghost');
INSERT INTO `oc_oct_sreview_reviews` VALUES
(1,'Store User','Great shop','Thanks for shopping',1,5,'2021-05-01 12:00:00','2021-05-02 12:00:00');
SQL;
    }
}

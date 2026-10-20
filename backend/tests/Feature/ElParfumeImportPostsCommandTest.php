<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Modules\Pages\Models\CmsPost;
use Tests\TestCase;

class ElParfumeImportPostsCommandTest extends TestCase
{
    private string $dumpPath = '';

    private string $mapPath = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->skipUnlessSqliteDriver();

        Schema::create('cms_posts', function (Blueprint $table): void {
            $table->id();
            $table->boolean('is_active')->default(true);
            $table->string('title');
            $table->string('slug')->nullable();
            $table->string('type', 16);
            $table->string('cover_image')->nullable();
            $table->text('excerpt')->nullable();
            $table->longText('content')->nullable();
            $table->string('seo_title')->nullable();
            $table->text('seo_description')->nullable();
            $table->timestamps();
            $table->unique(['type', 'slug']);
        });
        Schema::create('cms_pages', function (Blueprint $table): void {
            $table->id();
            $table->string('slug')->unique();
            $table->timestamps();
        });
        Schema::create('products', function (Blueprint $table): void {
            $table->id();
            $table->string('slug')->unique();
            $table->timestamps();
        });

        $dir = sys_get_temp_dir().'/elparfume-posts-'.uniqid('', true);
        mkdir($dir);
        $this->dumpPath = $dir.'/dump.sql';
        $this->mapPath = $dir.'/map.csv';
    }

    protected function tearDown(): void
    {
        if ($this->sqliteDriverAvailable()) {
            Schema::dropIfExists('products');
            Schema::dropIfExists('cms_pages');
            Schema::dropIfExists('cms_posts');
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

    public function test_slug_collision_link_rewrite_and_idempotent_rerun(): void
    {
        DB::table('products')->insert(['id' => 1, 'slug' => 'article-one', 'created_at' => now(), 'updated_at' => now()]);

        file_put_contents($this->dumpPath, <<<'SQL'
CREATE TABLE `oc_url_alias` (
  `url_alias_id` int NOT NULL,
  `query` varchar(255) NOT NULL,
  `keyword` varchar(255) NOT NULL,
  PRIMARY KEY (`url_alias_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_oct_blog_article` (
  `oct_blog_article_id` int NOT NULL AUTO_INCREMENT,
  `image` varchar(255) DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT '0',
  `date_added` datetime NOT NULL,
  `date_modified` datetime NOT NULL,
  PRIMARY KEY (`oct_blog_article_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_oct_blog_article_description` (
  `oct_blog_article_id` int NOT NULL,
  `language_id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text NOT NULL,
  `meta_title` varchar(255) NOT NULL,
  `meta_description` varchar(255) NOT NULL,
  PRIMARY KEY (`oct_blog_article_id`,`language_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

INSERT INTO `oc_url_alias` VALUES (1,'oct_blog_article_id=1','article-one');
INSERT INTO `oc_oct_blog_article` VALUES (1,'catalog/cover.jpg',1,'2020-01-01 10:00:00','2020-01-02 10:00:00');
INSERT INTO `oc_oct_blog_article_description` VALUES (1,1,'Article Title','&lt;p&gt;&lt;a href=&quot;https://el-parfume.by/old-product/&quot;&gt;Link&lt;/a&gt; and &lt;a href=&quot;unknown-page/&quot;&gt;Unknown&lt;/a&gt;&lt;/p&gt;','SEO title','SEO description');
SQL);

        file_put_contents($this->mapPath, implode("\n", [
            'old_path,type,old_id,url_form,target,method,decision,score,slug_score,name_score,old_name,our_id,our_name,cand2,cand3,gsc_impressions,note',
            '/old-product/,product,10,seo,/our-product,exact_slug,auto,1,1,1,Old,10,Our,,,0,',
        ]));

        $overridesPath = storage_path('app/elparfume/manual_overrides.csv');
        if (is_file($overridesPath)) {
            @unlink($overridesPath);
        }
        $exit = Artisan::call('elparfume:import-posts', [
            '--dump' => $this->dumpPath,
            '--map' => $this->mapPath,
        ]);
        $this->assertSame(0, $exit);

        $post = DB::table('cms_posts')->where('slug', 'article-one-elp')->first();
        $this->assertNotNull($post);
        $this->assertSame(CmsPost::TYPE_ARTICLE, $post->type);
        $this->assertStringContainsString('href="/our-product"', (string) $post->content);
        $this->assertStringContainsString('href="/catalog"', (string) $post->content);
        $this->assertStringContainsString('https://el-parfume.by/image/catalog/cover.jpg', (string) $post->cover_image);

        $this->assertFileExists($overridesPath);
        $overrideContents = file_get_contents($overridesPath);
        $this->assertIsString($overrideContents);
        $this->assertStringContainsString('/article-one/', $overrideContents);
        $this->assertStringContainsString('/article-one-elp', $overrideContents);

        $countAfterFirst = DB::table('cms_posts')->count();
        Artisan::call('elparfume:import-posts', [
            '--dump' => $this->dumpPath,
            '--map' => $this->mapPath,
        ]);
        $this->assertSame($countAfterFirst, DB::table('cms_posts')->count());

        @unlink($overridesPath);
    }

    public function test_inline_images_are_copied_from_images_dir(): void
    {
        Storage::fake('public');

        $imagesDir = dirname($this->dumpPath).'/site';
        mkdir($imagesDir.'/image/catalog/news', 0777, true);
        file_put_contents($imagesDir.'/image/catalog/news/a b.jpg', 'jpg');

        file_put_contents($this->dumpPath, <<<'SQL'
CREATE TABLE `oc_url_alias` (
  `url_alias_id` int NOT NULL,
  `query` varchar(255) NOT NULL,
  `keyword` varchar(255) NOT NULL
);
CREATE TABLE `oc_oct_blog_article` (
  `oct_blog_article_id` int NOT NULL,
  `image` varchar(255) DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT '0',
  `date_added` datetime NOT NULL,
  `date_modified` datetime NOT NULL
);
CREATE TABLE `oc_oct_blog_article_description` (
  `oct_blog_article_id` int NOT NULL,
  `language_id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text NOT NULL,
  `meta_title` varchar(255) NOT NULL,
  `meta_description` varchar(255) NOT NULL
);
INSERT INTO `oc_url_alias` VALUES (1,'oct_blog_article_id=1','article-img');
INSERT INTO `oc_oct_blog_article` VALUES (1,'',1,'2020-01-01 10:00:00','2020-01-01 10:00:00');
INSERT INTO `oc_oct_blog_article_description` VALUES (1,1,'Title','&lt;img src=&quot;https://el-parfume.by/image/catalog/news/a%20b.jpg&quot;&gt;&lt;img src=&quot;https://el-parfume.by/image/catalog/news/missing.jpg&quot;&gt;','','');
SQL);
        file_put_contents($this->mapPath, 'old_path,type,old_id,url_form,target,method,decision,score,slug_score,name_score,old_name,our_id,our_name,cand2,cand3,gsc_impressions,note');

        $exit = Artisan::call('elparfume:import-posts', [
            '--dump' => $this->dumpPath,
            '--map' => $this->mapPath,
            '--images-from' => $imagesDir,
        ]);
        $this->assertSame(0, $exit);

        $content = (string) DB::table('cms_posts')->where('slug', 'article-img')->value('content');
        $this->assertStringNotContainsString('el-parfume.by/image/catalog/news/a%20b.jpg', $content);
        $this->assertStringContainsString('el-parfume.by/image/catalog/news/missing.jpg', $content);
        Storage::disk('public')->assertExists('cms/posts/import/elparfume/catalog/news/a b.jpg');

        @unlink($imagesDir.'/image/catalog/news/a b.jpg');
        @rmdir($imagesDir.'/image/catalog/news');
        @rmdir($imagesDir.'/image/catalog');
        @rmdir($imagesDir.'/image');
        @rmdir($imagesDir);
    }
}

<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class ElParfumeExtractUrlsCommandTest extends TestCase
{
    private string $dumpPath = '';

    private string $gscPath = '';

    private string $outPath = '';

    protected function setUp(): void
    {
        parent::setUp();

        $this->dumpPath = sys_get_temp_dir().'/elparfume-urls-test-'.uniqid('', true).'.sql';
        $this->gscPath = sys_get_temp_dir().'/elparfume-gsc-test-'.uniqid('', true).'.csv';
        $this->outPath = sys_get_temp_dir().'/elparfume-out-test-'.uniqid('', true).'.csv';

        file_put_contents($this->dumpPath, <<<'SQL'
CREATE TABLE `oc_url_alias` (
  `url_alias_id` int NOT NULL AUTO_INCREMENT,
  `query` varchar(255) NOT NULL,
  `keyword` varchar(255) NOT NULL,
  PRIMARY KEY (`url_alias_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_product` (
  `product_id` int NOT NULL AUTO_INCREMENT,
  `manufacturer_id` int NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`product_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_product_description` (
  `product_id` int NOT NULL,
  `language_id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `meta_h1` varchar(255) NOT NULL,
  PRIMARY KEY (`product_id`,`language_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_manufacturer` (
  `manufacturer_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL,
  PRIMARY KEY (`manufacturer_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_category` (
  `category_id` int NOT NULL AUTO_INCREMENT,
  `status` tinyint(1) NOT NULL,
  PRIMARY KEY (`category_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_category_description` (
  `category_id` int NOT NULL,
  `language_id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `meta_h1` varchar(255) NOT NULL,
  PRIMARY KEY (`category_id`,`language_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_category_path` (
  `category_id` int NOT NULL,
  `path_id` int NOT NULL,
  `level` int NOT NULL,
  PRIMARY KEY (`category_id`,`path_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_information` (
  `information_id` int NOT NULL AUTO_INCREMENT,
  `status` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`information_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_information_description` (
  `information_id` int NOT NULL,
  `language_id` int NOT NULL,
  `title` varchar(64) NOT NULL,
  `meta_h1` varchar(255) NOT NULL,
  PRIMARY KEY (`information_id`,`language_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_oct_blog_article` (
  `oct_blog_article_id` int NOT NULL AUTO_INCREMENT,
  `status` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`oct_blog_article_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_oct_blog_article_description` (
  `oct_blog_article_id` int NOT NULL,
  `language_id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `meta_title` varchar(255) NOT NULL,
  PRIMARY KEY (`oct_blog_article_id`,`language_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_oct_blog_category` (
  `oct_blog_category_id` int NOT NULL AUTO_INCREMENT,
  `status` tinyint(1) NOT NULL,
  PRIMARY KEY (`oct_blog_category_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_oct_blog_category_description` (
  `oct_blog_category_id` int NOT NULL,
  `language_id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `meta_title` varchar(255) NOT NULL,
  PRIMARY KEY (`oct_blog_category_id`,`language_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_oct_filter_product_seo` (
  `seo_id` int NOT NULL AUTO_INCREMENT,
  `status` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`seo_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_oct_filter_product_seo_description` (
  `seo_id` int NOT NULL,
  `language_id` int NOT NULL,
  `seo_url` text NOT NULL,
  `seo_title` varchar(255) NOT NULL,
  `seo_h1` varchar(255) NOT NULL,
  PRIMARY KEY (`seo_id`,`language_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_product_option_value` (
  `product_option_value_id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `option_id` int NOT NULL,
  `option_value_id` int NOT NULL,
  PRIMARY KEY (`product_option_value_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

CREATE TABLE `oc_option_value_description` (
  `option_value_id` int NOT NULL,
  `language_id` int NOT NULL,
  `option_id` int NOT NULL,
  `name` varchar(128) NOT NULL,
  PRIMARY KEY (`option_value_id`,`language_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

INSERT INTO `oc_url_alias` VALUES
(1,'product_id=10','spaced-slug '),
(2,'manufacturer_id=5','zara-brand'),
(3,'category_id=100','zara-leaf'),
(4,'category_id=50','woman'),
(5,'information_id=3','about-us'),
(6,'oct_blog_article_id=7','news-post'),
(7,'oct_blog_category_id=1','blog-cat'),
(8,'common/home',''),
(9,'checkout/cart','cart');

INSERT INTO `oc_product` VALUES (10,5,1);
INSERT INTO `oc_product_description` VALUES (10,1,'Tom &amp; Jerry','Product H1');
INSERT INTO `oc_manufacturer` VALUES (5,'Zara');
INSERT INTO `oc_category` VALUES (50,1),(100,1);
INSERT INTO `oc_category_description` VALUES
(50,1,'Woman','Woman H1'),
(100,1,'Zara','Zara H1');
INSERT INTO `oc_category_path` VALUES
(100,50,0),
(100,100,1);
INSERT INTO `oc_information` VALUES (3,1);
INSERT INTO `oc_information_description` VALUES (3,1,'About','About H1');
INSERT INTO `oc_oct_blog_article` VALUES (7,1);
INSERT INTO `oc_oct_blog_article_description` VALUES (7,1,'News','News Title');
INSERT INTO `oc_oct_blog_category` VALUES (1,1);
INSERT INTO `oc_oct_blog_category_description` VALUES (1,1,'Blog','Blog Title');
INSERT INTO `oc_oct_filter_product_seo` VALUES (9,1);
INSERT INTO `oc_oct_filter_product_seo_description` VALUES (9,1,'woman/zara-filter','Filter title','Filter H1');
INSERT INTO `oc_product_option_value` VALUES
(1,10,13,101),
(2,10,13,102);
INSERT INTO `oc_option_value_description` VALUES
(101,1,13,'50 ml'),
(102,1,13,'100 ml');
SQL);

        file_put_contents($this->gscPath, <<<'CSV'
url,impressions
https://el-parfume.by/spaced-slug/,42
https://el-parfume.by/woman/zara-leaf,7
CSV);
    }

    protected function tearDown(): void
    {
        foreach ([$this->dumpPath, $this->gscPath, $this->outPath] as $path) {
            if ($path !== '' && is_file($path)) {
                @unlink($path);
            }
        }

        parent::tearDown();
    }

    public function test_extracts_urls_from_fixture_dump(): void
    {
        $exit = Artisan::call('elparfume:extract-urls', [
            '--dump' => $this->dumpPath,
            '--gsc' => $this->gscPath,
            '--out' => $this->outPath,
        ]);

        $this->assertSame(0, $exit);
        $this->assertFileExists($this->outPath);

        $handle = fopen($this->outPath, 'rb');
        $this->assertNotFalse($handle);
        $header = fgetcsv($handle);
        $this->assertSame([
            'old_path', 'type', 'old_id', 'url_form', 'keyword_raw', 'name', 'h1',
            'brand_old_id', 'brand_name', 'gender_hint', 'status', 'volumes', 'gsc_impressions',
        ], $header);

        $rows = [];
        while (($row = fgetcsv($handle)) !== false) {
            $rows[] = array_combine($header, $row);
        }
        fclose($handle);

        $byKey = [];
        foreach ($rows as $row) {
            $byKey[$row['type'].'|'.$row['url_form'].'|'.$row['old_path']] = $row;
        }

        $productSeo = $byKey['product|seo|/spaced-slug/'] ?? null;
        $this->assertNotNull($productSeo);
        $this->assertSame('10', $productSeo['old_id']);
        $this->assertSame('spaced-slug ', $productSeo['keyword_raw']);
        $this->assertSame('Tom & Jerry', $productSeo['name']);
        $this->assertSame('100 ml | 50 ml', $productSeo['volumes']);
        $this->assertSame('42', $productSeo['gsc_impressions']);

        $productIndex = $byKey['product|index_php|/index.php?route=product/product&product_id=10'] ?? null;
        $this->assertNotNull($productIndex);
        $this->assertSame('', $productIndex['keyword_raw']);

        $categorySeo = $byKey['category|seo|/woman/zara-leaf/'] ?? null;
        $this->assertNotNull($categorySeo);
        $this->assertSame('female', $categorySeo['gender_hint']);
        $this->assertSame('7', $categorySeo['gsc_impressions']);

        $categoryIndex = $byKey['category|index_php|/index.php?route=product/category&path=50_100'] ?? null;
        $this->assertNotNull($categoryIndex);

        $seoFilter = $byKey['seo_filter|seo|/woman/zara-filter/'] ?? null;
        $this->assertNotNull($seoFilter);
        $this->assertSame('female', $seoFilter['gender_hint']);

        $systemHome = $byKey['system|seo|/'] ?? null;
        $this->assertNotNull($systemHome);
        $this->assertSame('common/home', $systemHome['name']);

        $systemCart = $byKey['system|seo|/cart/'] ?? null;
        $this->assertNotNull($systemCart);
    }
}

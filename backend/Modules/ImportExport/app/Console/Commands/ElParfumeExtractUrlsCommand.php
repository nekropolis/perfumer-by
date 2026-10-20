<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Modules\ImportExport\Support\ElParfume\ElParfumeDumpReader;

class ElParfumeExtractUrlsCommand extends Command
{
    private const LANGUAGE_ID = '1';

    private int $skippedCategories = 0;

    protected $signature = 'elparfume:extract-urls
        {--dump=storage/app/elparfume/el_parfume_b.sql : Path to el-parfume SQL dump}
        {--gsc=storage/app/elparfume/index/gsc_pages.csv : Optional GSC export (url,impressions)}
        {--out=storage/app/elparfume/old_urls.csv : Output CSV path}';

    protected $description = 'Extract legacy el-parfume.by URL paths from OpenCart SQL dump';

    public function handle(): int
    {
        $dumpPath = $this->resolvePath((string) $this->option('dump'));
        $gscPath = $this->resolvePath((string) $this->option('gsc'));
        $outPath = $this->resolvePath((string) $this->option('out'));

        if (! is_file($dumpPath)) {
            $this->error("SQL dump not found: {$dumpPath}");

            return self::FAILURE;
        }

        $reader = new ElParfumeDumpReader($dumpPath);
        $rows = $this->buildRows($reader);

        $gscByPath = $this->loadGscImpressions($gscPath);

        foreach ($rows as &$row) {
            $row['gsc_impressions'] = $this->matchGscImpressions($row['old_path'], $gscByPath);
        }
        unset($row);

        $matchedImpressions = 0;
        $unmatchedGsc = [];
        foreach ($gscByPath as $path => $meta) {
            if ($meta['matched'] ?? false) {
                $matchedImpressions += (int) $meta['impressions'];
            } else {
                $unmatchedGsc[] = $path;
            }
        }

        usort($rows, static function (array $a, array $b): int {
            $typeCmp = strcmp($a['type'], $b['type']);
            if ($typeCmp !== 0) {
                return $typeCmp;
            }

            return strcmp($a['old_path'], $b['old_path']);
        });

        $this->writeCsv($outPath, $rows);
        $this->printSummary($rows, $unmatchedGsc, $matchedImpressions, $gscByPath);

        return self::SUCCESS;
    }

    private function resolvePath(string $path): string
    {
        $path = trim($path);
        if ($path === '') {
            return $path;
        }
        if ($path[0] === DIRECTORY_SEPARATOR) {
            return $path;
        }

        return base_path($path);
    }

    /**
     * @return list<array<string, string>>
     */
    private function buildRows(ElParfumeDumpReader $reader): array
    {
        $aliases = $reader->rows('oc_url_alias');
        $products = $this->indexById($reader->rows('oc_product'), 'product_id');
        $productDescriptions = $this->descriptionsByEntityId($reader->rows('oc_product_description'), 'product_id');
        $manufacturers = $this->indexById($reader->rows('oc_manufacturer'), 'manufacturer_id');
        $categories = $this->indexById($reader->rows('oc_category'), 'category_id');
        $categoryDescriptions = $this->descriptionsByEntityId($reader->rows('oc_category_description'), 'category_id');
        $categoryPaths = $this->groupCategoryPaths($reader->rows('oc_category_path'));
        $informations = $this->indexById($reader->rows('oc_information'), 'information_id');
        $informationDescriptions = $this->descriptionsByEntityId($reader->rows('oc_information_description'), 'information_id');
        $blogArticles = $this->indexById($reader->rows('oc_oct_blog_article'), 'oct_blog_article_id');
        $blogArticleDescriptions = $this->descriptionsByEntityId($reader->rows('oc_oct_blog_article_description'), 'oct_blog_article_id');
        $blogCategories = $this->indexById($reader->rows('oc_oct_blog_category'), 'oct_blog_category_id');
        $blogCategoryDescriptions = $this->descriptionsByEntityId($reader->rows('oc_oct_blog_category_description'), 'oct_blog_category_id');
        $seoFilters = $this->indexById($reader->rows('oc_oct_filter_product_seo'), 'seo_id');
        $seoFilterDescriptions = $this->descriptionsByEntityId($reader->rows('oc_oct_filter_product_seo_description'), 'seo_id');
        $productVolumes = $this->buildProductVolumes(
            $reader->rows('oc_product_option_value'),
            $reader->rows('oc_option_value_description'),
        );

        $keywordByCategoryId = [];
        foreach ($aliases as $alias) {
            $query = (string) ($alias['query'] ?? '');
            if (preg_match('/^category_id=(\d+)$/', $query, $matches) !== 1) {
                continue;
            }
            $categoryId = $matches[1];
            if (! isset($keywordByCategoryId[$categoryId])) {
                $keywordByCategoryId[$categoryId] = (string) ($alias['keyword'] ?? '');
            }
        }

        $rows = [];
        $skippedCategories = 0;
        $indexPhpEmitted = [
            'product' => [],
            'manufacturer' => [],
            'category' => [],
            'information' => [],
        ];

        foreach ($aliases as $alias) {
            $query = (string) ($alias['query'] ?? '');
            $keywordRaw = (string) ($alias['keyword'] ?? '');

            if (! str_contains($query, '=')) {
                $rows[] = $this->baseRow(
                    type: 'system',
                    oldId: '',
                    urlForm: 'seo',
                    keywordRaw: $keywordRaw,
                    oldPath: $this->seoPathFromKeyword($keywordRaw),
                    name: $query,
                    h1: '',
                    brandOldId: '',
                    brandName: '',
                    genderHint: '',
                    status: '1',
                    volumes: '',
                );
                continue;
            }

            if (preg_match('/^product_id=(\d+)$/', $query, $matches) === 1) {
                $productId = $matches[1];
                $product = $products[$productId] ?? null;
                $description = $productDescriptions[$productId] ?? null;
                $manufacturerId = (string) ($product['manufacturer_id'] ?? '');
                $manufacturer = $manufacturers[$manufacturerId] ?? null;

                $rows[] = $this->baseRow(
                    type: 'product',
                    oldId: $productId,
                    urlForm: 'seo',
                    keywordRaw: $keywordRaw,
                    oldPath: $this->seoPathFromKeyword($keywordRaw),
                    name: $this->text($description['name'] ?? ''),
                    h1: $this->text($description['meta_h1'] ?? ''),
                    brandOldId: $manufacturerId,
                    brandName: $this->text($manufacturer['name'] ?? ''),
                    genderHint: '',
                    status: (string) ($product['status'] ?? ''),
                    volumes: $productVolumes[$productId] ?? '',
                );

                if (! isset($indexPhpEmitted['product'][$productId])) {
                    $indexPhpEmitted['product'][$productId] = true;
                    $rows[] = $this->productIndexPhpRow(
                        $productId,
                        $description,
                        $product,
                        $manufacturer,
                        $productVolumes[$productId] ?? '',
                    );
                }
                continue;
            }

            if (preg_match('/^manufacturer_id=(\d+)$/', $query, $matches) === 1) {
                $manufacturerId = $matches[1];
                $manufacturer = $manufacturers[$manufacturerId] ?? null;

                $rows[] = $this->baseRow(
                    type: 'manufacturer',
                    oldId: $manufacturerId,
                    urlForm: 'seo',
                    keywordRaw: $keywordRaw,
                    oldPath: $this->seoPathFromKeyword($keywordRaw),
                    name: $this->text($manufacturer['name'] ?? ''),
                    h1: '',
                    brandOldId: '',
                    brandName: '',
                    genderHint: '',
                    status: '1',
                    volumes: '',
                );

                if (! isset($indexPhpEmitted['manufacturer'][$manufacturerId])) {
                    $indexPhpEmitted['manufacturer'][$manufacturerId] = true;
                    $rows[] = $this->baseRow(
                        type: 'manufacturer',
                        oldId: $manufacturerId,
                        urlForm: 'index_php',
                        keywordRaw: '',
                        oldPath: '/index.php?route=product/manufacturer/info&manufacturer_id='.$manufacturerId,
                        name: $this->text($manufacturer['name'] ?? ''),
                        h1: '',
                        brandOldId: '',
                        brandName: '',
                        genderHint: '',
                        status: '1',
                        volumes: '',
                    );
                }
                continue;
            }

            if (preg_match('/^category_id=(\d+)$/', $query, $matches) === 1) {
                $categoryId = $matches[1];
                $nested = $this->categoryNestedPath($categoryId, $categoryPaths, $keywordByCategoryId);
                if ($nested === null) {
                    $skippedCategories++;
                    continue;
                }

                $description = $categoryDescriptions[$categoryId] ?? null;
                $category = $categories[$categoryId] ?? null;
                $genderHint = $this->genderHintFromPath($nested);

                $rows[] = $this->baseRow(
                    type: 'category',
                    oldId: $categoryId,
                    urlForm: 'seo',
                    keywordRaw: $keywordRaw,
                    oldPath: $nested['path'],
                    name: $this->text($description['name'] ?? ''),
                    h1: $this->text($description['meta_h1'] ?? ''),
                    brandOldId: '',
                    brandName: '',
                    genderHint: $genderHint,
                    status: (string) ($category['status'] ?? ''),
                    volumes: '',
                );

                if (! isset($indexPhpEmitted['category'][$categoryId])) {
                    $indexPhpEmitted['category'][$categoryId] = true;
                    $rows[] = $this->baseRow(
                        type: 'category',
                        oldId: $categoryId,
                        urlForm: 'index_php',
                        keywordRaw: '',
                        oldPath: '/index.php?route=product/category&path='.implode('_', $nested['ids']),
                        name: $this->text($description['name'] ?? ''),
                        h1: $this->text($description['meta_h1'] ?? ''),
                        brandOldId: '',
                        brandName: '',
                        genderHint: $genderHint,
                        status: (string) ($category['status'] ?? ''),
                        volumes: '',
                    );
                }
                continue;
            }

            if (preg_match('/^information_id=(\d+)$/', $query, $matches) === 1) {
                $informationId = $matches[1];
                $information = $informations[$informationId] ?? null;
                $description = $informationDescriptions[$informationId] ?? null;

                $rows[] = $this->baseRow(
                    type: 'information',
                    oldId: $informationId,
                    urlForm: 'seo',
                    keywordRaw: $keywordRaw,
                    oldPath: $this->seoPathFromKeyword($keywordRaw),
                    name: $this->text($description['title'] ?? ''),
                    h1: $this->text($description['meta_h1'] ?? ''),
                    brandOldId: '',
                    brandName: '',
                    genderHint: '',
                    status: (string) ($information['status'] ?? ''),
                    volumes: '',
                );

                if (! isset($indexPhpEmitted['information'][$informationId])) {
                    $indexPhpEmitted['information'][$informationId] = true;
                    $rows[] = $this->baseRow(
                        type: 'information',
                        oldId: $informationId,
                        urlForm: 'index_php',
                        keywordRaw: '',
                        oldPath: '/index.php?route=information/information&information_id='.$informationId,
                        name: $this->text($description['title'] ?? ''),
                        h1: $this->text($description['meta_h1'] ?? ''),
                        brandOldId: '',
                        brandName: '',
                        genderHint: '',
                        status: (string) ($information['status'] ?? ''),
                        volumes: '',
                    );
                }
                continue;
            }

            if (preg_match('/^oct_blog_article_id=(\d+)$/', $query, $matches) === 1) {
                $articleId = $matches[1];
                $article = $blogArticles[$articleId] ?? null;
                $description = $blogArticleDescriptions[$articleId] ?? null;

                $rows[] = $this->baseRow(
                    type: 'blog_article',
                    oldId: $articleId,
                    urlForm: 'seo',
                    keywordRaw: $keywordRaw,
                    oldPath: $this->seoPathFromKeyword($keywordRaw),
                    name: $this->text($description['name'] ?? ''),
                    h1: $this->text($description['meta_title'] ?? ''),
                    brandOldId: '',
                    brandName: '',
                    genderHint: '',
                    status: (string) ($article['status'] ?? ''),
                    volumes: '',
                );
                continue;
            }

            if (preg_match('/^oct_blog_category_id=(\d+)$/', $query, $matches) === 1) {
                $blogCategoryId = $matches[1];
                $blogCategory = $blogCategories[$blogCategoryId] ?? null;
                $description = $blogCategoryDescriptions[$blogCategoryId] ?? null;

                $rows[] = $this->baseRow(
                    type: 'blog_category',
                    oldId: $blogCategoryId,
                    urlForm: 'seo',
                    keywordRaw: $keywordRaw,
                    oldPath: $this->seoPathFromKeyword($keywordRaw),
                    name: $this->text($description['name'] ?? ''),
                    h1: $this->text($description['meta_title'] ?? ''),
                    brandOldId: '',
                    brandName: '',
                    genderHint: '',
                    status: (string) ($blogCategory['status'] ?? ''),
                    volumes: '',
                );
            }
        }

        foreach ($seoFilterDescriptions as $seoId => $description) {
            $seo = $seoFilters[$seoId] ?? null;
            $seoUrl = trim((string) ($description['seo_url'] ?? ''), '/');
            $oldPath = '/'.$seoUrl.'/';
            $genderHint = $this->genderHintFromPathString($seoUrl);

            $rows[] = $this->baseRow(
                type: 'seo_filter',
                oldId: (string) $seoId,
                urlForm: 'seo',
                keywordRaw: '',
                oldPath: $oldPath,
                name: $this->text($description['seo_title'] ?? ''),
                h1: $this->text($description['seo_h1'] ?? ''),
                brandOldId: '',
                brandName: '',
                genderHint: $genderHint,
                status: (string) ($seo['status'] ?? ''),
                volumes: '',
            );
        }

        foreach ($products as $productId => $product) {
            if (isset($indexPhpEmitted['product'][$productId])) {
                continue;
            }
            $description = $productDescriptions[$productId] ?? null;
            $manufacturerId = (string) ($product['manufacturer_id'] ?? '');
            $manufacturer = $manufacturers[$manufacturerId] ?? null;
            $rows[] = $this->productIndexPhpRow(
                (string) $productId,
                $description,
                $product,
                $manufacturer,
                $productVolumes[$productId] ?? '',
            );
        }

        foreach ($manufacturers as $manufacturerId => $manufacturer) {
            if (isset($indexPhpEmitted['manufacturer'][$manufacturerId])) {
                continue;
            }
            $rows[] = $this->baseRow(
                type: 'manufacturer',
                oldId: (string) $manufacturerId,
                urlForm: 'index_php',
                keywordRaw: '',
                oldPath: '/index.php?route=product/manufacturer/info&manufacturer_id='.$manufacturerId,
                name: $this->text($manufacturer['name'] ?? ''),
                h1: '',
                brandOldId: '',
                brandName: '',
                genderHint: '',
                status: '1',
                volumes: '',
            );
        }

        foreach ($categories as $categoryId => $category) {
            if (isset($indexPhpEmitted['category'][$categoryId])) {
                continue;
            }
            $nested = $this->categoryNestedPath((string) $categoryId, $categoryPaths, $keywordByCategoryId);
            if ($nested === null) {
                continue;
            }
            $description = $categoryDescriptions[$categoryId] ?? null;
            $genderHint = $this->genderHintFromPath($nested);
            $rows[] = $this->baseRow(
                type: 'category',
                oldId: (string) $categoryId,
                urlForm: 'index_php',
                keywordRaw: '',
                oldPath: '/index.php?route=product/category&path='.implode('_', $nested['ids']),
                name: $this->text($description['name'] ?? ''),
                h1: $this->text($description['meta_h1'] ?? ''),
                brandOldId: '',
                brandName: '',
                genderHint: $genderHint,
                status: (string) ($category['status'] ?? ''),
                volumes: '',
            );
        }

        foreach ($informations as $informationId => $information) {
            if (isset($indexPhpEmitted['information'][$informationId])) {
                continue;
            }
            $description = $informationDescriptions[$informationId] ?? null;
            $rows[] = $this->baseRow(
                type: 'information',
                oldId: (string) $informationId,
                urlForm: 'index_php',
                keywordRaw: '',
                oldPath: '/index.php?route=information/information&information_id='.$informationId,
                name: $this->text($description['title'] ?? ''),
                h1: $this->text($description['meta_h1'] ?? ''),
                brandOldId: '',
                brandName: '',
                genderHint: '',
                status: (string) ($information['status'] ?? ''),
                volumes: '',
            );
        }

        $this->skippedCategories = $skippedCategories;

        return $rows;
    }

    /**
     * @param  array<string, ?string>|null  $description
     * @param  array<string, ?string>|null  $product
     * @param  array<string, ?string>|null  $manufacturer
     * @return array<string, string>
     */
    private function productIndexPhpRow(
        string $productId,
        ?array $description,
        ?array $product,
        ?array $manufacturer,
        string $volumes,
    ): array {
        $manufacturerId = (string) ($product['manufacturer_id'] ?? '');

        return $this->baseRow(
            type: 'product',
            oldId: $productId,
            urlForm: 'index_php',
            keywordRaw: '',
            oldPath: '/index.php?route=product/product&product_id='.$productId,
            name: $this->text($description['name'] ?? ''),
            h1: $this->text($description['meta_h1'] ?? ''),
            brandOldId: $manufacturerId,
            brandName: $this->text($manufacturer['name'] ?? ''),
            genderHint: '',
            status: (string) ($product['status'] ?? ''),
            volumes: $volumes,
        );
    }

    /**
     * @return array<string, string>
     */
    private function baseRow(
        string $type,
        string $oldId,
        string $urlForm,
        string $keywordRaw,
        string $oldPath,
        string $name,
        string $h1,
        string $brandOldId,
        string $brandName,
        string $genderHint,
        string $status,
        string $volumes,
    ): array {
        return [
            'old_path' => $oldPath,
            'type' => $type,
            'old_id' => $oldId,
            'url_form' => $urlForm,
            'keyword_raw' => $keywordRaw,
            'name' => $name,
            'h1' => $h1,
            'brand_old_id' => $brandOldId,
            'brand_name' => $brandName,
            'gender_hint' => $genderHint,
            'status' => $status,
            'volumes' => $volumes,
            'gsc_impressions' => '',
        ];
    }

    private function seoPathFromKeyword(string $keywordRaw): string
    {
        $keyword = trim($keywordRaw);
        if ($keyword === '') {
            return '/';
        }

        return '/'.$keyword.'/';
    }

    /**
     * @param  list<array<string, ?string>>  $rows
     * @return array<string, array<string, ?string>>
     */
    private function indexById(array $rows, string $idColumn): array
    {
        $index = [];
        foreach ($rows as $row) {
            $id = (string) ($row[$idColumn] ?? '');
            if ($id === '') {
                continue;
            }
            $index[$id] = $row;
        }

        return $index;
    }

    /**
     * @param  list<array<string, ?string>>  $rows
     * @return array<string, array<string, ?string>>
     */
    private function descriptionsByEntityId(array $rows, string $entityColumn): array
    {
        $index = [];
        foreach ($rows as $row) {
            if (($row['language_id'] ?? '') !== self::LANGUAGE_ID) {
                continue;
            }
            $id = (string) ($row[$entityColumn] ?? '');
            if ($id === '') {
                continue;
            }
            $index[$id] = $row;
        }

        return $index;
    }

    /**
     * @param  list<array<string, ?string>>  $rows
     * @return array<string, list<array{level:int, path_id:string}>>
     */
    private function groupCategoryPaths(array $rows): array
    {
        $grouped = [];
        foreach ($rows as $row) {
            $categoryId = (string) ($row['category_id'] ?? '');
            if ($categoryId === '') {
                continue;
            }
            $grouped[$categoryId][] = [
                'level' => (int) ($row['level'] ?? 0),
                'path_id' => (string) ($row['path_id'] ?? ''),
            ];
        }

        foreach ($grouped as $categoryId => $segments) {
            usort($segments, static fn (array $a, array $b): int => $a['level'] <=> $b['level']);
            $grouped[$categoryId] = $segments;
        }

        return $grouped;
    }

    /**
     * @param  array<string, list<array{level:int, path_id:string}>>  $categoryPaths
     * @param  array<string, string>  $keywordByCategoryId
     * @return array{path:string, ids:list<string>}|null
     */
    private function categoryNestedPath(string $categoryId, array $categoryPaths, array $keywordByCategoryId): ?array
    {
        $segments = $categoryPaths[$categoryId] ?? [];
        if ($segments === []) {
            return null;
        }

        $keywords = [];
        $ids = [];
        foreach ($segments as $segment) {
            $pathId = $segment['path_id'];
            $keyword = trim((string) ($keywordByCategoryId[$pathId] ?? ''));
            if ($keyword === '') {
                return null;
            }
            $keywords[] = $keyword;
            $ids[] = $pathId;
        }

        return [
            'path' => '/'.implode('/', $keywords).'/',
            'ids' => $ids,
        ];
    }

    private function genderHintFromPath(array $nested): string
    {
        return $this->genderHintFromPathString(ltrim($nested['path'], '/'));
    }

    private function genderHintFromPathString(string $path): string
    {
        $first = explode('/', trim($path, '/'))[0] ?? '';

        return match ($first) {
            'woman' => 'female',
            'man' => 'male',
            default => '',
        };
    }

    /**
     * @param  list<array<string, ?string>>  $optionValues
     * @param  list<array<string, ?string>>  $optionValueDescriptions
     * @return array<string, string>
     */
    private function buildProductVolumes(array $optionValues, array $optionValueDescriptions): array
    {
        $namesByOptionValueId = [];
        foreach ($optionValueDescriptions as $row) {
            if (($row['language_id'] ?? '') !== self::LANGUAGE_ID) {
                continue;
            }
            if (($row['option_id'] ?? '') !== '13') {
                continue;
            }
            $optionValueId = (string) ($row['option_value_id'] ?? '');
            if ($optionValueId === '') {
                continue;
            }
            $namesByOptionValueId[$optionValueId] = (string) ($row['name'] ?? '');
        }

        $byProduct = [];
        foreach ($optionValues as $row) {
            if (($row['option_id'] ?? '') !== '13') {
                continue;
            }
            $productId = (string) ($row['product_id'] ?? '');
            $optionValueId = (string) ($row['option_value_id'] ?? '');
            if ($productId === '' || $optionValueId === '') {
                continue;
            }
            $name = trim((string) ($namesByOptionValueId[$optionValueId] ?? ''));
            if ($name === '') {
                continue;
            }
            $byProduct[$productId][$name] = true;
        }

        $result = [];
        foreach ($byProduct as $productId => $names) {
            $list = array_keys($names);
            sort($list);
            $result[$productId] = implode(' | ', $list);
        }

        return $result;
    }

    private function text(mixed $value): string
    {
        $string = trim(html_entity_decode((string) $value, ENT_QUOTES | ENT_HTML5, 'UTF-8'));

        return $string;
    }

    /**
     * @return array<string, array{impressions:int, matched:bool}>
     */
    private function loadGscImpressions(string $gscPath): array
    {
        if (! is_file($gscPath)) {
            return [];
        }

        $handle = fopen($gscPath, 'rb');
        if (! $handle) {
            return [];
        }

        $header = fgetcsv($handle);
        if (! is_array($header)) {
            fclose($handle);

            return [];
        }

        $result = [];
        while (($row = fgetcsv($handle)) !== false) {
            if (! is_array($row) || $row === []) {
                continue;
            }
            $url = (string) ($row[0] ?? '');
            $path = $this->normalizeUrlToPath($url);
            if ($path === '') {
                continue;
            }
            $impressions = (int) ($row[1] ?? 0);
            if (! isset($result[$path])) {
                $result[$path] = ['impressions' => 0, 'matched' => false];
            }
            $result[$path]['impressions'] += $impressions;
        }

        fclose($handle);

        return $result;
    }

    private function normalizeUrlToPath(string $url): string
    {
        $url = trim($url);
        if ($url === '') {
            return '';
        }

        if (str_starts_with($url, 'http://') || str_starts_with($url, 'https://')) {
            $parts = parse_url($url);
            $path = (string) ($parts['path'] ?? '/');
            $query = isset($parts['query']) && $parts['query'] !== '' ? '?'.$parts['query'] : '';

            return $path === '' ? '/'.$query : $path.$query;
        }

        if (! str_starts_with($url, '/')) {
            $url = '/'.$url;
        }

        return $url;
    }

    /**
     * @param  array<string, array{impressions:int, matched:bool}>  $gscByPath
     */
    private function matchGscImpressions(string $oldPath, array &$gscByPath): string
    {
        if ($gscByPath === []) {
            return '';
        }

        $candidates = [$oldPath];
        if (str_ends_with($oldPath, '/')) {
            $candidates[] = rtrim($oldPath, '/');
        } else {
            $candidates[] = $oldPath.'/';
        }

        foreach ($candidates as $candidate) {
            if (! isset($gscByPath[$candidate])) {
                continue;
            }
            $gscByPath[$candidate]['matched'] = true;

            return (string) $gscByPath[$candidate]['impressions'];
        }

        return '';
    }

    /**
     * @param  list<array<string, string>>  $rows
     */
    private function writeCsv(string $outPath, array $rows): void
    {
        $dir = dirname($outPath);
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $handle = fopen($outPath, 'wb');
        if (! $handle) {
            throw new \RuntimeException("Cannot write CSV: {$outPath}");
        }

        fputcsv($handle, [
            'old_path',
            'type',
            'old_id',
            'url_form',
            'keyword_raw',
            'name',
            'h1',
            'brand_old_id',
            'brand_name',
            'gender_hint',
            'status',
            'volumes',
            'gsc_impressions',
        ]);

        foreach ($rows as $row) {
            fputcsv($handle, [
                $row['old_path'],
                $row['type'],
                $row['old_id'],
                $row['url_form'],
                $row['keyword_raw'],
                $row['name'],
                $row['h1'],
                $row['brand_old_id'],
                $row['brand_name'],
                $row['gender_hint'],
                $row['status'],
                $row['volumes'],
                $row['gsc_impressions'],
            ]);
        }

        fclose($handle);
    }

    /**
     * @param  list<array<string, string>>  $rows
     * @param  list<string>  $unmatchedGsc
     * @param  array<string, array{impressions:int, matched:bool}>  $gscByPath
     */
    private function printSummary(array $rows, array $unmatchedGsc, int $matchedImpressions, array $gscByPath): void
    {
        $counts = [];
        foreach ($rows as $row) {
            $key = $row['type'].'|'.$row['url_form'];
            $counts[$key] = ($counts[$key] ?? 0) + 1;
        }
        ksort($counts);

        $this->info('el-parfume URL extraction finished.');
        $this->line('Rows by type and url_form:');
        $tableRows = [];
        foreach ($counts as $key => $count) {
            [$type, $urlForm] = explode('|', $key, 2);
            $tableRows[] = [$type, $urlForm, (string) $count];
        }
        $this->table(['type', 'url_form', 'rows'], $tableRows);
        $this->line('Skipped categories (missing ancestor keyword): '.$this->skippedCategories);

        if ($gscByPath !== []) {
            $totalGscImpressions = array_sum(array_map(static fn (array $row): int => $row['impressions'], $gscByPath));
            $unmatchedImpressions = 0;
            foreach ($unmatchedGsc as $path) {
                $unmatchedImpressions += (int) ($gscByPath[$path]['impressions'] ?? 0);
            }
            $this->line("GSC impressions matched: {$matchedImpressions}");
            $this->line("GSC impressions unmatched: {$unmatchedImpressions}");
            $this->line('GSC total impressions: '.$totalGscImpressions);
            $this->line('GSC paths unmatched: '.count($unmatchedGsc));
            if ($unmatchedGsc !== []) {
                $this->line('First unmatched GSC paths:');
                foreach (array_slice($unmatchedGsc, 0, 20) as $path) {
                    $this->line('  '.$path);
                }
            }
        }
    }
}

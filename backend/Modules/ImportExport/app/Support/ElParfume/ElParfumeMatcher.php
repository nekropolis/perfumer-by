<?php

namespace Modules\ImportExport\Support\ElParfume;

class ElParfumeMatcher
{
    private const AUTO_SCORE = 0.92;

    private const REVIEW_SCORE = 0.75;

    private const AMBIGUITY_GAP = 0.03;

    /** @var array<string, array{target:string,decision:string,note:string,check_page:bool}> */
    private const INFORMATION = [
        'about_us' => ['target' => '/', 'decision' => 'review', 'note' => 'no_about_page', 'check_page' => false],
        'privacy' => ['target' => '/politika-obrabotki-personalnyh-dannyh', 'decision' => 'static', 'note' => '', 'check_page' => true],
        'terms' => ['target' => '/publichnaya-oferta', 'decision' => 'static', 'note' => '', 'check_page' => true],
        'oplata-i-dostavka' => ['target' => '/dostavka', 'decision' => 'static', 'note' => '', 'check_page' => true],
        'jenskie-brendy' => ['target' => '/brands', 'decision' => 'static', 'note' => '', 'check_page' => false],
        'myjskie-brendy' => ['target' => '/brands', 'decision' => 'static', 'note' => '', 'check_page' => false],
        'proverka-batch-coda' => ['target' => '/proverka-batch-coda', 'decision' => 'static', 'note' => '', 'check_page' => true],
        'loyalty' => ['target' => '/', 'decision' => 'review', 'note' => 'no_loyalty_page', 'check_page' => false],
    ];

    /** @var array<string, array{target:string,decision:string}> */
    private const SYSTEM = [
        '' => ['target' => '/', 'decision' => 'static'],
        'cart' => ['target' => '/cart', 'decision' => 'static'],
        'checkout' => ['target' => '/checkout', 'decision' => 'static'],
        'simplecheckout' => ['target' => '/checkout', 'decision' => 'static'],
        'login' => ['target' => '/login', 'decision' => 'static'],
        'create-account' => ['target' => '/login', 'decision' => 'static'],
        'forgot-password' => ['target' => '/login', 'decision' => 'static'],
        'my-account' => ['target' => '/account', 'decision' => 'static'],
        'edit-account' => ['target' => '/account', 'decision' => 'static'],
        'change-password' => ['target' => '/account', 'decision' => 'static'],
        'address-book' => ['target' => '/account', 'decision' => 'static'],
        'order-history' => ['target' => '/account', 'decision' => 'static'],
        'newsletter' => ['target' => '/account', 'decision' => 'static'],
        'reward-points' => ['target' => '/account', 'decision' => 'static'],
        'transactions' => ['target' => '/account', 'decision' => 'static'],
        'downloads' => ['target' => '/account', 'decision' => 'static'],
        'vouchers' => ['target' => '/account', 'decision' => 'static'],
        'returns' => ['target' => '/account', 'decision' => 'static'],
        'request-return' => ['target' => '/account', 'decision' => 'static'],
        'add-return' => ['target' => '/account', 'decision' => 'static'],
        'wishlist' => ['target' => '/wishlist', 'decision' => 'static'],
        'specials' => ['target' => '/catalog?sale=1', 'decision' => 'static'],
        'brands' => ['target' => '/brands', 'decision' => 'static'],
        'contact-us' => ['target' => '/contacts', 'decision' => 'static'],
        'sitemap' => ['target' => '/sitemap.xml', 'decision' => 'static'],
        'fx-sitemap' => ['target' => '/sitemap.xml', 'decision' => 'static'],
        'simpleregister' => ['target' => '/login', 'decision' => 'static'],
        'search' => ['target' => '/search', 'decision' => 'static'],
        'reviews' => ['target' => '/reviews', 'decision' => 'static'],
        'gift-vouchers' => ['target' => '/gift-certificates', 'decision' => 'static'],
        'compare-products' => ['target' => '/catalog', 'decision' => 'static'],
    ];

    /** @var array<string, true> */
    private const APP_PATHS = [
        '/' => true,
        '/catalog' => true,
        '/brands' => true,
        '/articles' => true,
        '/news' => true,
        '/contacts' => true,
        '/cart' => true,
        '/checkout' => true,
        '/login' => true,
        '/account' => true,
        '/wishlist' => true,
        '/search' => true,
        '/reviews' => true,
        '/gift-certificates' => true,
    ];

    /** @var list<array<string, mixed>> */
    private array $brands = [];

    /** @var array<string, array<string, mixed>> */
    private array $brandsById = [];

    /** @var array<string, array<string, mixed>> */
    private array $brandsBySlug = [];

    /** @var array<string, list<array<string, mixed>>> */
    private array $productsByBrand = [];

    /** @var array<string, true> */
    private array $categoryGenderDrop = [];

    /**
     * @param  list<array{id:int,name:string,slug:string,is_active:bool}>  $brands
     * @param  list<array{id:int,brand_id:int,name:string,slug:string,is_active:bool}>  $products
     * @param  array<string, string>  $synonyms
     * @param  array<string, string>  $overrides
     * @param  array<string, true>|null  $cmsPageSlugs
     * @param  array<string, true>|null  $cmsPostSlugs
     */
    public function __construct(
        private readonly ElParfumeNormalizer $normalizer,
        array $brands,
        array $products,
        private readonly array $synonyms,
        private readonly array $overrides,
        private readonly ?array $cmsPageSlugs,
        private readonly ?array $cmsPostSlugs,
    ) {
        foreach ([
            'мужской', 'мужская', 'мужские', 'мужское', 'мужчин',
            'женский', 'женская', 'женские', 'женское', 'женщин',
            'для', 'myjskie', 'jenskie', 'zhenskie', 'muzhskie',
        ] as $word) {
            foreach ($this->normalizer->normalize($word)['tokens'] as $token) {
                $this->categoryGenderDrop[$token] = true;
            }
        }

        foreach ($brands as $brand) {
            $prepared = $this->prepareBrand($brand);
            $this->brands[] = $prepared;
            $this->brandsById[(string) $prepared['id']] = $prepared;
            $this->brandsBySlug[mb_strtolower($prepared['slug'], 'UTF-8')] = $prepared;
        }

        foreach ($products as $product) {
            $brandId = (string) $product['brand_id'];
            $this->productsByBrand[$brandId][] = [
                'id' => (int) $product['id'],
                'name' => (string) $product['name'],
                'slug' => (string) $product['slug'],
                'is_active' => (bool) $product['is_active'],
                'slugNorm' => $this->normalizer->normalize((string) $product['slug']),
                'nameNorm' => $this->normalizer->normalize((string) $product['name']),
            ];
        }
    }

    /**
     * @param  list<array<string, string>>  $rows
     * @return list<array<string, mixed>>
     */
    public function match(array $rows): array
    {
        $out = array_fill(0, count($rows), null);
        $seoByKey = [];

        foreach ($rows as $index => $row) {
            if (($row['url_form'] ?? '') === 'index_php') {
                continue;
            }
            $matched = $this->applyOverride($this->matchOne($row));
            $out[$index] = $matched;
            $seoByKey[($row['type'] ?? '').'|'.($row['old_id'] ?? '')] = $matched;
        }

        foreach ($rows as $index => $row) {
            if (($row['url_form'] ?? '') !== 'index_php') {
                continue;
            }
            $key = ($row['type'] ?? '').'|'.($row['old_id'] ?? '');
            if (isset($seoByKey[$key])) {
                $matched = $this->mirror($row, $seoByKey[$key]);
            } else {
                $matched = $this->matchOne($row);
            }
            $out[$index] = $this->applyOverride($matched);
        }

        foreach ($rows as $index => $row) {
            if ($out[$index] === null) {
                $out[$index] = $this->blank($row);
            }
        }

        return $out;
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return list<array<string, string>>
     */
    public function unmatched(array $rows): array
    {
        $picked = [];
        foreach ($rows as $row) {
            $type = (string) ($row['type'] ?? '');
            $decision = (string) ($row['decision'] ?? '');
            if (($row['url_form'] ?? '') !== 'seo') {
                continue;
            }
            if (! in_array($type, ['product', 'manufacturer', 'category'], true)) {
                continue;
            }
            if (! in_array($decision, ['review', 'fallback'], true)) {
                continue;
            }
            $candidates = $row['_candidates'] ?? [];
            $picked[] = [
                'old_path' => (string) $row['old_path'],
                'type' => $type,
                'old_id' => (string) $row['old_id'],
                'url_form' => (string) $row['url_form'],
                'target' => (string) $row['target'],
                'method' => (string) $row['method'],
                'decision' => $decision,
                'score' => (string) $row['score'],
                'old_name' => (string) $row['old_name'],
                'our_id' => (string) $row['our_id'],
                'our_name' => (string) $row['our_name'],
                'gsc_impressions' => (string) $row['gsc_impressions'],
                'note' => (string) $row['note'],
                'cand1' => (string) ($candidates[0] ?? ''),
                'cand2' => (string) ($candidates[1] ?? ''),
                'cand3' => (string) ($candidates[2] ?? ''),
            ];
        }

        usort($picked, static function (array $a, array $b): int {
            $impressions = (int) $b['gsc_impressions'] <=> (int) $a['gsc_impressions'];
            if ($impressions !== 0) {
                return $impressions;
            }

            return strcmp($a['old_path'], $b['old_path']);
        });

        return $picked;
    }

    /**
     * @param  array<string, string>  $row
     * @return array<string, mixed>
     */
    private function matchOne(array $row): array
    {
        return match ($row['type'] ?? '') {
            'product' => $this->matchProduct($row),
            'manufacturer' => $this->matchManufacturer($row),
            'category' => $this->matchCategory($row),
            'seo_filter' => $this->staticRow($row, $this->genderTarget((string) ($row['gender_hint'] ?? '')), 'static', '', 'pending_landing'),
            'information' => $this->matchInformation($row),
            'blog_article' => $this->matchBlogArticle($row),
            'blog_category' => $this->staticRow($row, '/articles', 'static'),
            'system' => $this->matchSystem($row),
            default => $this->staticRow($row, '/', 'review', 'unknown_type'),
        };
    }

    /**
     * @param  array<string, string>  $row
     * @return array<string, mixed>
     */
    private function matchProduct(array $row): array
    {
        $base = $this->blank($row);
        $brandMatch = $this->matchBrand((string) ($row['brand_name'] ?? ''), '', false);
        if ($brandMatch['status'] !== 'auto' || $brandMatch['brand'] === null) {
            $base['target'] = '/catalog';
            $base['method'] = 'fallback_catalog';
            $base['decision'] = 'fallback';
            $base['note'] = 'brand_not_auto';
            $this->attachRanked($base, $brandMatch['ranked']);

            return $base;
        }

        $brand = $brandMatch['brand'];
        $products = $this->productsByBrand[(string) $brand['id']] ?? [];
        $drop = $brand['nameTokens'];
        foreach ($this->normalizer->normalize((string) ($row['brand_name'] ?? ''))['tokens'] as $token) {
            $drop[$token] = true;
        }

        $oldSlug = $this->normalizer->normalize((string) ($row['keyword_raw'] ?? ''));
        $oldName = $this->normalizer->withoutTokens($this->normalizer->normalize((string) ($row['name'] ?? '')), $drop);
        $oldH1 = $this->normalizer->withoutTokens($this->normalizer->normalize((string) ($row['h1'] ?? '')), $drop);

        $ranked = [];
        foreach ($products as $product) {
            $candidateName = $this->normalizer->withoutTokens($product['nameNorm'], $drop);
            $byName = $this->scorePair($oldSlug, $oldName, $product['slugNorm'], $candidateName, $product);
            $byH1 = $this->scorePair($oldSlug, $oldH1, $product['slugNorm'], $candidateName, $product);
            $scored = $this->preferScore($byName, $byH1);
            if ($scored['score'] <= 0) {
                continue;
            }
            $ranked[] = $scored;
        }
        $ranked = $this->sortRanked($ranked);
        $judgement = $this->judge($ranked);

        if ($judgement['status'] === 'none') {
            return $this->brandFallback($base, $brand, $ranked, 'product_unmatched');
        }

        $top = $judgement['top'];
        $decision = $judgement['status'];
        $method = (string) $top['method'];
        $target = '/'.$top['slug'];
        $note = $judgement['ambiguous'] ? 'ambiguous' : '';
        $accepted = $top;

        if (! $top['is_active']) {
            $note = $this->joinNotes($note, 'inactive_product');
            $method = 'fallback_brand';
            if ($brand['is_active']) {
                $target = $this->brandUrl((string) $brand['slug']);
            } else {
                $target = '/catalog';
                $method = 'fallback_catalog';
                $note = $this->joinNotes($note, 'inactive_brand');
            }
            if ($decision === 'auto') {
                $decision = 'fallback';
            }
        }

        $base['target'] = $target;
        $base['method'] = $method;
        $base['decision'] = $decision;
        $base['note'] = $note;
        $base['our_id'] = (string) $accepted['id'];
        $base['our_name'] = (string) $accepted['name'];
        $this->attachRanked($base, $ranked);

        return $base;
    }

    /**
     * @param  array<string, string>  $row
     * @return array<string, mixed>
     */
    private function matchManufacturer(array $row): array
    {
        $base = $this->blank($row);
        $keyword = $this->normalizer->stripTrailingIdSuffix((string) ($row['keyword_raw'] ?? ''));
        $brandMatch = $this->matchBrand((string) ($row['name'] ?? ''), $keyword, false);

        return $this->applyBrandDecision($base, $brandMatch, '/catalog');
    }

    /**
     * @param  array<string, string>  $row
     * @return array<string, mixed>
     */
    private function matchCategory(array $row): array
    {
        $segments = array_values(array_filter(
            explode('/', trim((string) ($row['old_path'] ?? ''), '/')),
            static fn (string $part): bool => $part !== '',
        ));
        if ($segments === ['woman'] || $segments === ['man']) {
            $hint = (string) ($row['gender_hint'] ?? '');
            if ($hint === '') {
                $hint = $segments[0] === 'woman' ? 'female' : 'male';
            }

            return $this->staticRow($row, $this->genderTarget($hint), 'static');
        }

        $base = $this->blank($row);
        $keyword = $this->normalizer->stripCategoryKeyword((string) ($row['keyword_raw'] ?? ''));
        $brandMatch = $this->matchBrand((string) ($row['name'] ?? ''), $keyword, true);
        $genderTarget = $this->genderTarget((string) ($row['gender_hint'] ?? ''));

        if ($brandMatch['status'] === 'auto' && $brandMatch['brand'] !== null && $brandMatch['brand']['is_active']) {
            $top = $brandMatch['ranked'][0];
            $base['target'] = $this->brandUrl((string) $brandMatch['brand']['slug']);
            $base['method'] = (string) $top['method'];
            $base['decision'] = 'auto';
            $base['our_id'] = (string) $brandMatch['brand']['id'];
            $base['our_name'] = (string) $brandMatch['brand']['name'];
            $this->attachRanked($base, $brandMatch['ranked']);

            return $base;
        }

        if ($brandMatch['status'] === 'auto' && $brandMatch['brand'] !== null) {
            $base['target'] = '/catalog';
            $base['method'] = 'fallback_catalog';
            $base['decision'] = 'fallback';
            $base['note'] = 'inactive_brand';
            $base['our_id'] = (string) $brandMatch['brand']['id'];
            $base['our_name'] = (string) $brandMatch['brand']['name'];
            $this->attachRanked($base, $brandMatch['ranked']);

            return $base;
        }

        $base['target'] = $genderTarget;
        if ($brandMatch['status'] === 'review' && $brandMatch['brand'] !== null) {
            $top = $brandMatch['ranked'][0];
            $base['method'] = (string) $top['method'];
            $base['decision'] = 'review';
            $base['note'] = $brandMatch['ambiguous'] ? 'ambiguous' : '';
            $base['our_id'] = (string) $brandMatch['brand']['id'];
            $base['our_name'] = (string) $brandMatch['brand']['name'];
        } else {
            $base['method'] = 'fallback_catalog';
            $base['decision'] = 'fallback';
        }
        $this->attachRanked($base, $brandMatch['ranked']);

        return $base;
    }

    /**
     * @param  array<string, string>  $row
     * @return array<string, mixed>
     */
    private function matchInformation(array $row): array
    {
        $keyword = mb_strtolower(trim((string) ($row['keyword_raw'] ?? '')), 'UTF-8');
        $mapped = self::INFORMATION[$keyword] ?? null;
        if ($mapped === null) {
            return $this->staticRow($row, '/', 'review', 'unknown_information');
        }

        $note = $mapped['note'];
        if ($mapped['check_page']) {
            $note = $this->joinNotes($note, $this->missingPage($mapped['target']));
        }

        return $this->staticRow($row, $mapped['target'], $mapped['decision'], $note);
    }

    /**
     * @param  array<string, string>  $row
     * @return array<string, mixed>
     */
    private function matchBlogArticle(array $row): array
    {
        $keyword = trim((string) ($row['keyword_raw'] ?? ''));
        if ($keyword === '') {
            return $this->staticRow($row, '/', 'review', 'unknown_article');
        }

        $target = '/'.$keyword;

        return $this->staticRow($row, $target, 'static', $this->missingPost($keyword));
    }

    /**
     * @param  array<string, string>  $row
     * @return array<string, mixed>
     */
    private function matchSystem(array $row): array
    {
        $keyword = mb_strtolower(trim((string) ($row['keyword_raw'] ?? '')), 'UTF-8');
        if (isset(self::SYSTEM[$keyword])) {
            $mapped = self::SYSTEM[$keyword];

            return $this->staticRow($row, $mapped['target'], $mapped['decision']);
        }
        if (str_contains($keyword, 'affiliate')) {
            return $this->staticRow($row, '/', 'static');
        }

        return $this->staticRow($row, '/', 'review', 'unknown_system');
    }

    /**
     * @return array{status:string,ambiguous:bool,brand:?array<string,mixed>,ranked:list<array<string,mixed>>}
     */
    private function matchBrand(string $name, string $keyword, bool $categoryGender): array
    {
        $synonym = $this->synonymBrand($name, $keyword);
        if ($synonym !== null) {
            $ranked = [[
                'id' => $synonym['id'],
                'name' => $synonym['name'],
                'slug' => $synonym['slug'],
                'is_active' => $synonym['is_active'],
                'score' => 1.0,
                'slug_score' => 1.0,
                'name_score' => 1.0,
                'method' => 'synonym',
            ]];

            return [
                'status' => 'auto',
                'ambiguous' => false,
                'brand' => $synonym,
                'ranked' => $ranked,
            ];
        }

        $oldSlug = $this->normalizer->normalize($keyword);
        $oldName = $this->normalizer->normalize($name);
        if ($categoryGender) {
            $oldSlug = $this->normalizer->withoutTokens($oldSlug, $this->categoryGenderDrop);
            $oldName = $this->normalizer->withoutTokens($oldName, $this->categoryGenderDrop);
        }

        $ranked = [];
        foreach ($this->brands as $brand) {
            $scored = $this->scorePair($oldSlug, $oldName, $brand['slugNorm'], $brand['nameNorm'], $brand);
            if ($scored['score'] <= 0) {
                continue;
            }
            $ranked[] = $scored;
        }
        $ranked = $this->sortRanked($ranked);
        $judgement = $this->judge($ranked);

        $brand = null;
        if ($judgement['status'] !== 'none' && $judgement['top'] !== null) {
            $brand = $this->brandsById[(string) $judgement['top']['id']] ?? null;
        }

        return [
            'status' => $judgement['status'],
            'ambiguous' => $judgement['ambiguous'],
            'brand' => $brand,
            'ranked' => array_slice($ranked, 0, 3),
        ];
    }

    /**
     * @param  array<string, mixed>  $base
     * @param  array{status:string,ambiguous:bool,brand:?array<string,mixed>,ranked:list<array<string,mixed>>}  $brandMatch
     * @return array<string, mixed>
     */
    private function applyBrandDecision(array $base, array $brandMatch, string $fallbackTarget): array
    {
        if ($brandMatch['brand'] === null || $brandMatch['status'] === 'none') {
            $base['target'] = $fallbackTarget;
            $base['method'] = 'fallback_catalog';
            $base['decision'] = 'fallback';
            $this->attachRanked($base, $brandMatch['ranked']);

            return $base;
        }

        $brand = $brandMatch['brand'];
        $top = $brandMatch['ranked'][0];
        $base['our_id'] = (string) $brand['id'];
        $base['our_name'] = (string) $brand['name'];
        $this->attachRanked($base, $brandMatch['ranked']);

        if (! $brand['is_active']) {
            $base['target'] = '/catalog';
            $base['method'] = 'fallback_catalog';
            $base['decision'] = 'fallback';
            $base['note'] = 'inactive_brand';

            return $base;
        }

        $base['target'] = $this->brandUrl((string) $brand['slug']);
        $base['method'] = (string) $top['method'];
        $base['decision'] = $brandMatch['status'];
        $base['note'] = $brandMatch['ambiguous'] ? 'ambiguous' : '';

        return $base;
    }

    /**
     * @param  array<string, mixed>  $base
     * @param  array<string, mixed>  $brand
     * @param  list<array<string, mixed>>  $ranked
     * @return array<string, mixed>
     */
    private function brandFallback(array $base, array $brand, array $ranked, string $note): array
    {
        if ($brand['is_active']) {
            $base['target'] = $this->brandUrl((string) $brand['slug']);
            $base['method'] = 'fallback_brand';
        } else {
            $base['target'] = '/catalog';
            $base['method'] = 'fallback_catalog';
            $note = $this->joinNotes($note, 'inactive_brand');
        }
        $base['decision'] = 'fallback';
        $base['note'] = $note;
        $base['our_id'] = (string) $brand['id'];
        $base['our_name'] = (string) $brand['name'];
        $this->attachRanked($base, $ranked);

        return $base;
    }

    /**
     * @param  array{spaced:string,sorted:string,compact:string,tokens:list<string>}  $oldSlug
     * @param  array{spaced:string,sorted:string,compact:string,tokens:list<string>}  $oldName
     * @param  array{spaced:string,sorted:string,compact:string,tokens:list<string>}  $candSlug
     * @param  array{spaced:string,sorted:string,compact:string,tokens:list<string>}  $candName
     * @param  array<string, mixed>  $entity
     * @return array<string, mixed>
     */
    private function scorePair(array $oldSlug, array $oldName, array $candSlug, array $candName, array $entity): array
    {
        $slugScore = $this->levRatio($oldSlug['compact'], $candSlug['compact']);
        $nameScore = $this->nameScore($oldName, $candName);
        $exactName = $oldName['sorted'] !== '' && $oldName['sorted'] === $candName['sorted'];
        $exactSlug = $oldSlug['spaced'] !== '' && $oldSlug['spaced'] === $candSlug['spaced'];

        if ($exactName) {
            $method = 'exact_name';
            $score = 1.0;
        } elseif ($exactSlug) {
            $method = 'exact_slug';
            $score = 1.0;
        } else {
            $bonus = ($slugScore >= 0.8 && $nameScore >= 0.8) ? 0.05 : 0.0;
            $score = min(1.0, max($slugScore, $nameScore) + $bonus);
            if ($slugScore >= 0.8 && $nameScore >= 0.8) {
                $method = 'both';
            } elseif ($slugScore >= $nameScore) {
                $method = 'fuzzy_slug';
            } else {
                $method = 'fuzzy_name';
            }
        }

        return [
            'id' => (int) $entity['id'],
            'name' => (string) $entity['name'],
            'slug' => (string) $entity['slug'],
            'is_active' => (bool) $entity['is_active'],
            'score' => $score,
            'slug_score' => $slugScore,
            'name_score' => $nameScore,
            'method' => $method,
        ];
    }

    /**
     * @param  array{spaced:string,sorted:string,compact:string,tokens:list<string>}  $left
     * @param  array{spaced:string,sorted:string,compact:string,tokens:list<string>}  $right
     */
    private function nameScore(array $left, array $right): float
    {
        $jaccard = $this->jaccard($left['tokens'], $right['tokens']);

        return max($jaccard, $this->levRatio($left['sorted'], $right['sorted']));
    }

    /**
     * @param  list<string>  $left
     * @param  list<string>  $right
     */
    private function jaccard(array $left, array $right): float
    {
        if ($left === [] || $right === []) {
            return 0.0;
        }
        $intersection = array_intersect($left, $right);
        $union = array_unique(array_merge($left, $right));
        $unionCount = count($union);
        if ($unionCount === 0) {
            return 0.0;
        }

        return count($intersection) / $unionCount;
    }

    private function levRatio(string $left, string $right): float
    {
        if ($left === '' || $right === '') {
            return 0.0;
        }
        if ($left === $right) {
            return 1.0;
        }
        $max = max(strlen($left), strlen($right));
        if (strlen($left) > 255 || strlen($right) > 255) {
            similar_text($left, $right, $percent);

            return $percent / 100;
        }
        $distance = levenshtein($left, $right);
        if ($distance < 0) {
            return 0.0;
        }

        return 1 - ($distance / $max);
    }

    /**
     * @param  list<array<string, mixed>>  $ranked
     * @return array{status:string,ambiguous:bool,top:?array<string,mixed>}
     */
    private function judge(array $ranked): array
    {
        $top = $ranked[0] ?? null;
        if ($top === null || $top['score'] < self::REVIEW_SCORE) {
            return ['status' => 'none', 'ambiguous' => false, 'top' => $top];
        }

        $second = $ranked[1]['score'] ?? null;
        $ambiguous = false;
        if ($second !== null) {
            $gap = $top['score'] - $second;
            $bothPerfect = $top['score'] >= 0.999 && $second >= 0.999;
            $closeBelowExact = $gap <= self::AMBIGUITY_GAP && $top['score'] < 1.0;
            $ambiguous = $bothPerfect || $closeBelowExact;
        }

        if ($ambiguous || $top['score'] < self::AUTO_SCORE) {
            return ['status' => 'review', 'ambiguous' => $ambiguous, 'top' => $top];
        }

        return ['status' => 'auto', 'ambiguous' => false, 'top' => $top];
    }

    /**
     * @param  list<array<string, mixed>>  $ranked
     * @return list<array<string, mixed>>
     */
    private function sortRanked(array $ranked): array
    {
        usort($ranked, static function (array $left, array $right): int {
            $score = $right['score'] <=> $left['score'];
            if ($score !== 0) {
                return $score;
            }

            return $left['id'] <=> $right['id'];
        });

        return $ranked;
    }

    /**
     * @param  array<string, mixed>  $primary
     * @param  array<string, mixed>  $alternate
     * @return array<string, mixed>
     */
    private function preferScore(array $primary, array $alternate): array
    {
        if ($alternate['score'] > $primary['score']) {
            return $alternate;
        }
        if ($primary['score'] > $alternate['score']) {
            return $primary;
        }
        if ($alternate['method'] === 'exact_name' && $primary['method'] !== 'exact_name') {
            return $alternate;
        }

        return $primary;
    }

    /**
     * @param  array{id:int,name:string,slug:string,is_active:bool}  $brand
     * @return array<string, mixed>
     */
    private function prepareBrand(array $brand): array
    {
        $nameNorm = $this->normalizer->normalize($brand['name']);
        $tokens = [];
        foreach ($nameNorm['tokens'] as $token) {
            $tokens[$token] = true;
        }

        return [
            'id' => (int) $brand['id'],
            'name' => (string) $brand['name'],
            'slug' => (string) $brand['slug'],
            'is_active' => (bool) $brand['is_active'],
            'slugNorm' => $this->normalizer->normalize($brand['slug']),
            'nameNorm' => $nameNorm,
            'nameTokens' => $tokens,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function synonymBrand(string $name, string $keyword): ?array
    {
        if ($this->synonyms === []) {
            return null;
        }

        $keys = [];
        foreach ([$keyword, $name] as $value) {
            $value = trim($value);
            if ($value === '') {
                continue;
            }
            $keys[] = mb_strtolower($value, 'UTF-8');
            $norm = $this->normalizer->normalize($value);
            if ($norm['sorted'] !== '') {
                $keys[] = $norm['sorted'];
            }
            if ($norm['compact'] !== '') {
                $keys[] = $norm['compact'];
            }
        }

        foreach ($keys as $key) {
            if ($key === '' || ! isset($this->synonyms[$key])) {
                continue;
            }
            $slug = mb_strtolower($this->synonyms[$key], 'UTF-8');
            if (isset($this->brandsBySlug[$slug])) {
                return $this->brandsBySlug[$slug];
            }
        }

        return null;
    }

    /**
     * @param  array<string, string>  $row
     * @return array<string, mixed>
     */
    private function blank(array $row): array
    {
        return [
            'old_path' => (string) ($row['old_path'] ?? ''),
            'type' => (string) ($row['type'] ?? ''),
            'old_id' => (string) ($row['old_id'] ?? ''),
            'url_form' => (string) ($row['url_form'] ?? ''),
            'target' => '/catalog',
            'method' => 'fallback_catalog',
            'decision' => 'fallback',
            'score' => '',
            'slug_score' => '',
            'name_score' => '',
            'old_name' => (string) ($row['name'] ?? ''),
            'our_id' => '',
            'our_name' => '',
            'cand2' => '',
            'cand3' => '',
            'gsc_impressions' => (string) ($row['gsc_impressions'] ?? ''),
            'note' => '',
            '_candidates' => [],
        ];
    }

    /**
     * @param  array<string, string>  $row
     * @return array<string, mixed>
     */
    private function staticRow(array $row, string $target, string $decision, string $note = '', string $method = 'static'): array
    {
        $base = $this->blank($row);
        $base['target'] = $target === '' ? '/catalog' : $target;
        $base['method'] = $method;
        $base['decision'] = $decision;
        $base['note'] = $note;
        $base['score'] = '';
        $base['slug_score'] = '';
        $base['name_score'] = '';

        return $base;
    }

    /**
     * @param  array<string, mixed>  $base
     * @param  list<array<string, mixed>>  $ranked
     */
    private function attachRanked(array &$base, array $ranked): void
    {
        $top = $ranked[0] ?? null;
        if ($top !== null) {
            $base['score'] = $this->fmt((float) $top['score']);
            $base['slug_score'] = $this->fmt((float) $top['slug_score']);
            $base['name_score'] = $this->fmt((float) $top['name_score']);
        }

        $candidates = [];
        foreach (array_slice($ranked, 0, 3) as $candidate) {
            $candidates[] = $candidate['id'].'|'.$candidate['slug'].'|'.$candidate['name'].'|'.$this->fmt((float) $candidate['score']);
        }
        $base['_candidates'] = $candidates;
        $base['cand2'] = $candidates[1] ?? '';
        $base['cand3'] = $candidates[2] ?? '';
    }

    /**
     * @param  array<string, mixed>  $result
     * @return array<string, mixed>
     */
    private function applyOverride(array $result): array
    {
        $path = (string) ($result['old_path'] ?? '');
        if ($path === '' || ! isset($this->overrides[$path])) {
            return $result;
        }

        $target = trim($this->overrides[$path]);
        if ($target === '') {
            return $result;
        }

        $result['target'] = $target;
        $result['method'] = 'override';
        $result['decision'] = 'auto';
        $result['note'] = '';

        return $result;
    }

    /**
     * @param  array<string, string>  $row
     * @param  array<string, mixed>  $seo
     * @return array<string, mixed>
     */
    private function mirror(array $row, array $seo): array
    {
        $copy = $seo;
        $copy['old_path'] = (string) ($row['old_path'] ?? '');
        $copy['type'] = (string) ($row['type'] ?? '');
        $copy['old_id'] = (string) ($row['old_id'] ?? '');
        $copy['url_form'] = (string) ($row['url_form'] ?? '');
        $copy['old_name'] = (string) ($row['name'] ?? '');
        $copy['gsc_impressions'] = (string) ($row['gsc_impressions'] ?? '');

        return $copy;
    }

    private function brandUrl(string $slug): string
    {
        return '/brands/'.$slug;
    }

    private function genderTarget(string $hint): string
    {
        if (in_array($hint, ['female', 'male', 'unisex'], true)) {
            return '/catalog?gender='.$hint;
        }

        return '/catalog';
    }

    private function missingPage(string $target): string
    {
        if ($this->cmsPageSlugs === null || $this->isAppPath($target)) {
            return '';
        }
        $slug = trim($target, '/');
        if ($slug === '' || str_contains($slug, '/')) {
            return '';
        }

        return isset($this->cmsPageSlugs[$slug]) ? '' : 'target_missing';
    }

    private function missingPost(string $keyword): string
    {
        if ($this->cmsPostSlugs === null) {
            return '';
        }
        $slug = trim($keyword, '/');

        return isset($this->cmsPostSlugs[$slug]) ? '' : 'target_missing';
    }

    private function isAppPath(string $target): bool
    {
        $path = explode('?', $target, 2)[0];
        if (isset(self::APP_PATHS[$path])) {
            return true;
        }

        return str_starts_with($path, '/brands/') || str_starts_with($path, '/catalog');
    }

    private function joinNotes(string ...$notes): string
    {
        $notes = array_values(array_filter($notes, static fn (string $note): bool => $note !== ''));

        return implode(';', $notes);
    }

    private function fmt(float $score): string
    {
        return sprintf('%.4f', $score);
    }
}

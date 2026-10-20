<?php

namespace Modules\ImportExport\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\Catalog\Models\CatalogLanding;
use Modules\Catalog\Support\CatalogProductAttributeIds;
use Modules\ImportExport\Support\ElParfume\ElParfumeDumpReader;
use Modules\ImportExport\Support\ElParfume\ElParfumeHtmlContent;
use Modules\ImportExport\Support\ElParfume\ElParfumeNormalizer;
use Modules\ImportExport\Support\ElParfume\ElParfumeRedirectMap;
use Modules\ImportExport\Support\VanilleHelper;

class ElParfumeImportLandingsCommand extends Command
{
    private const LANGUAGE_ID = '1';

    private const REPORT_COLUMNS = [
        'old_path',
        'impressions',
        'group',
        'value',
        'attr_id',
        'option_id',
        'products',
        'action',
        'target',
        'note',
    ];

    protected $signature = 'elparfume:import-landings
        {--dump=storage/app/elparfume/el_parfume_b.sql : Path to el-parfume SQL dump}
        {--urls=storage/app/elparfume/old_urls.csv : Extracted URL CSV}
        {--map=storage/app/elparfume/redirect_map.csv : Redirect map for HTML link rewrite}
        {--overrides=storage/app/elparfume/manual_overrides.csv : old_path,target overrides merged for elparfume:match}
        {--report=storage/app/elparfume/landings_report.csv : Landing import report}
        {--all : Import every seo_filter URL, including rows with no GSC impressions}
        {--dry-run : Parse and report without writing the database or CSV files}
        {--no-link-rewrite : Keep el-parfume links in landing content}';

    protected $description = 'Import el-parfume.by SEO filter pages into catalog landings and redirect overrides';

    public function handle(): int
    {
        $dumpPath = $this->resolvePath((string) $this->option('dump'));
        $urlsPath = $this->resolvePath((string) $this->option('urls'));
        $dryRun = (bool) $this->option('dry-run');
        $importAll = (bool) $this->option('all');

        if (! is_file($dumpPath)) {
            $this->error("SQL dump not found: {$dumpPath}");

            return self::FAILURE;
        }
        if (! is_file($urlsPath)) {
            $this->error("URL CSV not found: {$urlsPath}");

            return self::FAILURE;
        }

        $reader = new ElParfumeDumpReader($dumpPath);
        $descriptions = $this->descriptionsBySeoId($reader->rows('oc_oct_filter_product_seo_description'));
        $filterRows = $this->seoFilterRows($this->readCsv($urlsPath));

        $withImpressions = 0;
        $scoped = [];
        foreach ($filterRows as $row) {
            $impressions = $this->impressions($row);
            if ($impressions > 0) {
                $withImpressions++;
            }
            if (! $importAll && $impressions <= 0) {
                continue;
            }
            $scoped[] = $row;
        }

        $normalizer = new ElParfumeNormalizer();
        $plans = [];
        foreach ($scoped as $row) {
            $plans[] = $this->planRow($row, $descriptions);
        }

        $this->printParseStats(count($filterRows), $withImpressions, count($descriptions), $plans);

        if (! $this->databaseReady()) {
            if ($dryRun) {
                $this->warn('Database tables are not available; parsed the dump only.');

                return self::SUCCESS;
            }

            $this->error('catalog_landings, products, and attribute option tables are required');

            return self::FAILURE;
        }

        $valueNames = $this->loadValueNames($reader, $plans);
        $optionsByAttribute = $this->loadOptions($normalizer);
        $redirectMap = $this->resolveRedirectMap();

        $report = [];
        $overrides = [];
        $created = 0;
        $updated = 0;
        $fallback = 0;

        foreach ($plans as $plan) {
            $decision = $this->decide($plan, $valueNames, $optionsByAttribute, $normalizer, $redirectMap);
            $action = 'fallback';
            if ($decision['landing'] !== null) {
                $slug = $decision['landing']['slug'];
                $existed = CatalogLanding::query()->where('slug', $slug)->exists();
                if (! $dryRun) {
                    CatalogLanding::query()->updateOrCreate(
                        ['slug' => $slug],
                        $decision['landing']['attributes'],
                    );
                }
                $action = $existed ? 'updated' : 'created';
            }

            if ($action === 'created') {
                $created++;
            } elseif ($action === 'updated') {
                $updated++;
            } else {
                $fallback++;
            }

            $reportRow = $decision['report'];
            $reportRow['action'] = $action;
            $report[] = $reportRow;
            $overrides[] = [
                'old_path' => $reportRow['old_path'],
                'target' => $reportRow['target'],
            ];
        }

        if (! $dryRun) {
            $this->mergeOverrides($this->resolvePath((string) $this->option('overrides')), $overrides);
            $this->writeReport($this->resolvePath((string) $this->option('report')), $report);
        }

        $this->info('El-parfume landings import finished.');
        $this->line('Created: '.$created);
        $this->line('Updated: '.$updated);
        $this->line('Fallback: '.$fallback);
        $this->line('Mode: '.($dryRun ? 'dry-run' : 'write'));

        return self::SUCCESS;
    }

    /**
     * @param  list<array<string, ?string>>  $rows
     * @return array<string, array<string, ?string>>
     */
    private function descriptionsBySeoId(array $rows): array
    {
        $indexed = [];
        foreach ($rows as $row) {
            if ((string) ($row['language_id'] ?? '') !== self::LANGUAGE_ID) {
                continue;
            }
            $id = trim((string) ($row['seo_id'] ?? ''));
            if ($id !== '') {
                $indexed[$id] = $row;
            }
        }

        return $indexed;
    }

    /**
     * @param  list<array<string, string>>  $rows
     * @return list<array<string, string>>
     */
    private function seoFilterRows(array $rows): array
    {
        $filters = [];
        foreach ($rows as $row) {
            if (($row['type'] ?? '') === 'seo_filter') {
                $filters[] = $row;
            }
        }

        return $filters;
    }

    /**
     * @param  array<string, string>  $row
     */
    private function impressions(array $row): int
    {
        $raw = trim((string) ($row['gsc_impressions'] ?? ''));
        if ($raw === '' || ! is_numeric($raw)) {
            return 0;
        }

        return (int) $raw;
    }

    /**
     * @param  array<string, string>  $row
     * @param  array<string, array<string, ?string>>  $descriptions
     * @return array<string, mixed>
     */
    private function planRow(array $row, array $descriptions): array
    {
        $oldPath = trim((string) ($row['old_path'] ?? ''));
        $seoId = trim((string) ($row['old_id'] ?? ''));
        $description = $descriptions[$seoId] ?? null;
        $parsed = $this->parseFilterPath($oldPath);
        if ($parsed === null && $description !== null) {
            $parsed = $this->parseFilterPath('/'.trim((string) ($description['seo_url'] ?? ''), '/').'/');
        }

        $gender = $parsed['gender'] ?? null;
        if ($gender === null) {
            $hint = trim((string) ($row['gender_hint'] ?? ''));
            if (in_array($hint, ['female', 'male', 'unisex'], true)) {
                $gender = $hint;
            }
        }

        $group = (string) ($parsed['group'] ?? '');
        $valueSlug = (string) ($parsed['value_slug'] ?? '');
        $attributeId = $parsed === null ? null : $this->attributeIdForGroup($group, '', $valueSlug);

        return [
            'old_path' => $oldPath,
            'seo_id' => $seoId,
            'impressions' => $this->impressions($row),
            'gender' => $gender,
            'group' => $group,
            'value_slug' => $valueSlug,
            'value_mod' => (string) ($parsed['value_mod'] ?? ''),
            'attribute_id' => $attributeId,
            'description' => $description,
            'csv_h1' => trim((string) ($row['h1'] ?? '')),
        ];
    }

    /**
     * @return array{gender:?string,group:string,value_slug:string,value_mod:string}|null
     */
    private function parseFilterPath(string $oldPath): ?array
    {
        $path = ElParfumeHtmlContent::normalizeOldPath($oldPath);
        if (preg_match('#^/(?:(woman|man|unisex)/)?filter/([a-z0-9_]+)_(\d+)/([a-z0-9_]+)_(\d+)$#i', $path, $matches) !== 1) {
            return null;
        }

        $gender = match (strtolower((string) ($matches[1] ?? ''))) {
            'woman' => 'female',
            'man' => 'male',
            'unisex' => 'unisex',
            default => null,
        };
        $valueSlug = strtolower($matches[4]);

        return [
            'gender' => $gender,
            'group' => strtolower($matches[2]),
            'value_slug' => $valueSlug,
            'value_mod' => $valueSlug.'_'.$matches[5],
        ];
    }

    private function attributeIdForGroup(string $group, string $displayName, string $valueSlug): ?int
    {
        $mapped = match ($group) {
            'vremya_goda' => CatalogProductAttributeIds::SEASON_ATTRIBUTE_ID,
            'aromat' => CatalogProductAttributeIds::FRAGRANCE_FAMILY_ATTRIBUTE_ID,
            'verkhnie_noty' => CatalogProductAttributeIds::TOP_NOTES_ATTRIBUTE_ID,
            'noty_serdtsa' => CatalogProductAttributeIds::HEART_NOTES_ATTRIBUTE_ID,
            'bazovye_noty' => CatalogProductAttributeIds::BASE_NOTES_ATTRIBUTE_ID,
            'stojkost' => CatalogProductAttributeIds::STABILITY_ATTRIBUTE_ID,
            'shlejf' => CatalogProductAttributeIds::SILLAGE_ATTRIBUTE_ID,
            'primenenie' => $this->isTimeOfDayValue($displayName, $valueSlug)
                ? CatalogProductAttributeIds::TIME_OF_DAY_ATTRIBUTE_ID
                : null,
            default => null,
        };

        return $mapped;
    }

    private function isTimeOfDayValue(string $displayName, string $valueSlug): bool
    {
        return $this->isEveningLike($displayName, $valueSlug) || $this->isEverydayLike($displayName, $valueSlug);
    }

    private function isEveningLike(string $displayName, string $valueSlug): bool
    {
        $haystack = mb_strtolower($displayName.' '.$valueSlug, 'UTF-8');

        return str_contains($haystack, 'вечер') || str_contains($haystack, 'vechern');
    }

    private function isEverydayLike(string $displayName, string $valueSlug): bool
    {
        $haystack = mb_strtolower($displayName.' '.$valueSlug, 'UTF-8');
        foreach (['каждый день', 'повседнев', 'ежеднев', 'kazhdyj', 'povsednev', 'ezhednev'] as $needle) {
            if (str_contains($haystack, $needle)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  list<array<string, mixed>>  $plans
     */
    private function printParseStats(int $filterRows, int $withImpressions, int $descriptions, array $plans): void
    {
        $groups = [];
        foreach ($plans as $plan) {
            $group = (string) ($plan['group'] !== '' ? $plan['group'] : '(unparsed)');
            $attr = $plan['attribute_id'] === null ? '' : (string) $plan['attribute_id'];
            $key = $group.'|'.$attr;
            if (! isset($groups[$key])) {
                $groups[$key] = ['group' => $group, 'attr_id' => $attr, 'rows' => 0];
            }
            $groups[$key]['rows']++;
        }
        ksort($groups);

        $this->info('El-parfume landing parse.');
        $this->line('SEO filter URLs: '.$filterRows);
        $this->line('With impressions: '.$withImpressions);
        $this->line('In scope: '.count($plans));
        $this->line('Dump descriptions (ru): '.$descriptions);
        $this->table(
            ['group', 'attr_id', 'rows'],
            array_map(static fn (array $row): array => [$row['group'], $row['attr_id'], (string) $row['rows']], $groups),
        );
    }

    private function databaseReady(): bool
    {
        try {
            return Schema::hasTable('catalog_landings')
                && Schema::hasTable('product_attribute_options')
                && Schema::hasTable('products')
                && Schema::hasTable('product_attribute_values')
                && Schema::hasTable('product_attribute_value_options');
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * @param  list<array<string, mixed>>  $plans
     * @return array<string, array<string, int>>
     */
    private function loadValueNames(ElParfumeDumpReader $reader, array $plans): array
    {
        $needed = [];
        foreach ($plans as $plan) {
            $mod = (string) $plan['value_mod'];
            if ($mod !== '') {
                $needed[$mod] = true;
            }
        }
        if ($needed === []) {
            return [];
        }

        $counts = [];
        foreach ($reader->rows('oc_oct_filter_product_attribute') as $row) {
            if ((string) ($row['language_id'] ?? '') !== self::LANGUAGE_ID) {
                continue;
            }
            $mod = mb_strtolower(trim((string) ($row['attribute_value_mod'] ?? '')), 'UTF-8');
            if ($mod === '' || ! isset($needed[$mod])) {
                continue;
            }
            $name = $this->cleanDisplayName((string) ($row['attribute_value'] ?? ''));
            if ($name === '') {
                continue;
            }
            $counts[$mod][$name] = ($counts[$mod][$name] ?? 0) + 1;
        }

        return $counts;
    }

    private function cleanDisplayName(string $name): string
    {
        $name = str_replace("\xC2\xA0", ' ', $name);
        $name = preg_replace('/\s+/u', ' ', trim($name)) ?? trim($name);

        return trim($name, " \t\n\r\0\x0B,.;");
    }

    /**
     * @return array<int, list<array{id:int,name:string,active:bool,norm:array{spaced:string,sorted:string,compact:string,tokens:list<string>}}>>
     */
    private function loadOptions(ElParfumeNormalizer $normalizer): array
    {
        $attributeIds = [
            CatalogProductAttributeIds::SEASON_ATTRIBUTE_ID,
            CatalogProductAttributeIds::FRAGRANCE_FAMILY_ATTRIBUTE_ID,
            CatalogProductAttributeIds::TOP_NOTES_ATTRIBUTE_ID,
            CatalogProductAttributeIds::HEART_NOTES_ATTRIBUTE_ID,
            CatalogProductAttributeIds::BASE_NOTES_ATTRIBUTE_ID,
            CatalogProductAttributeIds::STABILITY_ATTRIBUTE_ID,
            CatalogProductAttributeIds::SILLAGE_ATTRIBUTE_ID,
            CatalogProductAttributeIds::TIME_OF_DAY_ATTRIBUTE_ID,
        ];

        $columns = ['id', 'product_attribute_id', 'name'];
        $hasActive = Schema::hasColumn('product_attribute_options', 'is_active');
        if ($hasActive) {
            $columns[] = 'is_active';
        }

        $grouped = [];
        foreach (DB::table('product_attribute_options')->whereIn('product_attribute_id', $attributeIds)->get($columns) as $option) {
            $attributeId = (int) $option->product_attribute_id;
            $grouped[$attributeId][] = [
                'id' => (int) $option->id,
                'name' => (string) $option->name,
                'active' => ! $hasActive || $this->isActive($option->is_active),
                'norm' => $normalizer->normalize((string) $option->name),
            ];
        }

        return $grouped;
    }

    /**
     * @param  array<string, mixed>  $plan
     * @param  array<string, array<string, int>>  $valueNames
     * @param  array<int, list<array{id:int,name:string,active:bool,norm:array{spaced:string,sorted:string,compact:string,tokens:list<string>}}>>  $optionsByAttribute
     * @return array{action:string,landing:?array{slug:string,attributes:array<string,mixed>},report:array<string,string>}
     */
    private function decide(
        array $plan,
        array $valueNames,
        array $optionsByAttribute,
        ElParfumeNormalizer $normalizer,
        ?ElParfumeRedirectMap $redirectMap,
    ): array {
        $displayName = $this->pickDisplayName(
            $valueNames[(string) $plan['value_mod']] ?? [],
            (string) $plan['value_slug'],
            $normalizer,
        );
        $group = (string) $plan['group'];
        $valueSlug = (string) $plan['value_slug'];
        $attributeId = $group === '' ? null : $this->attributeIdForGroup($group, $displayName, $valueSlug);
        $gender = $plan['gender'] !== null ? (string) $plan['gender'] : null;

        $report = [
            'old_path' => (string) $plan['old_path'],
            'impressions' => (string) $plan['impressions'],
            'group' => $group,
            'value' => $displayName !== '' ? $displayName : $valueSlug,
            'attr_id' => '',
            'option_id' => '',
            'products' => '0',
            'action' => 'fallback',
            'target' => $this->genderTarget($gender),
            'note' => '',
        ];

        if ($group === '') {
            $report['note'] = 'bad_path';

            return ['action' => 'fallback', 'landing' => null, 'report' => $report];
        }

        if ($attributeId === null) {
            $report['note'] = $group === 'primenenie' ? 'unmapped_application' : 'unmapped_group';

            return ['action' => 'fallback', 'landing' => null, 'report' => $report];
        }

        $report['attr_id'] = (string) $attributeId;
        $optionId = $this->matchOption(
            $optionsByAttribute[$attributeId] ?? [],
            $displayName,
            $valueSlug,
            $normalizer,
            $group,
        );
        if ($optionId === null) {
            $report['note'] = 'option_not_found';

            return ['action' => 'fallback', 'landing' => null, 'report' => $report];
        }

        $report['option_id'] = (string) $optionId;
        $products = $this->countActiveProducts($gender, $attributeId, $optionId);
        $report['products'] = (string) $products;
        if ($products <= 0) {
            $report['note'] = 'no_products';

            return ['action' => 'fallback', 'landing' => null, 'report' => $report];
        }

        $texts = $this->landingTexts($plan, $redirectMap);
        if ($texts['h1'] === '') {
            $report['note'] = 'missing_h1';

            return ['action' => 'fallback', 'landing' => null, 'report' => $report];
        }

        $slug = VanilleHelper::slugify($texts['h1']);
        if ($slug === '') {
            $slug = 'landing-'.((string) $plan['seo_id'] !== '' ? (string) $plan['seo_id'] : $optionId);
        }

        $report['target'] = '/catalog/'.$slug;
        $report['note'] = '';

        return [
            'action' => 'create',
            'landing' => [
                'slug' => $slug,
                'attributes' => [
                    'gender' => $gender,
                    'filters' => [(string) $attributeId => [$optionId]],
                    'h1' => $texts['h1'],
                    'seo_title' => $texts['seo_title'],
                    'seo_description' => $texts['seo_description'],
                    'content' => $texts['content'],
                    'is_active' => true,
                ],
            ],
            'report' => $report,
        ];
    }

    /**
     * @param  array<string, int>  $counts
     */
    private function pickDisplayName(array $counts, string $valueSlug, ElParfumeNormalizer $normalizer): string
    {
        if ($counts === []) {
            return '';
        }

        $slugNorm = $normalizer->normalize(str_replace('_', ' ', $valueSlug));
        $best = '';
        $bestScore = -1;
        foreach ($counts as $name => $count) {
            $norm = $normalizer->normalize($name);
            $score = (int) $count;
            if ($slugNorm['spaced'] !== '' && ($norm['spaced'] === $slugNorm['spaced'] || $norm['compact'] === $slugNorm['compact'])) {
                $score += 100000;
            }
            if (preg_match('/^\p{Lu}/u', $name) === 1) {
                $score += 10;
            }
            if ($score > $bestScore) {
                $bestScore = $score;
                $best = $name;
            }
        }

        return $best;
    }

    /**
     * @param  list<array{id:int,name:string,active:bool,norm:array{spaced:string,sorted:string,compact:string,tokens:list<string>}}>  $options
     */
    private function matchOption(
        array $options,
        string $displayName,
        string $valueSlug,
        ElParfumeNormalizer $normalizer,
        string $group,
    ): ?int {
        $candidates = [];
        if ($displayName !== '') {
            $candidates[] = $normalizer->normalize($displayName);
        }
        $slugNorm = $normalizer->normalize(str_replace('_', ' ', $valueSlug));
        if ($slugNorm['spaced'] !== '') {
            $candidates[] = $slugNorm;
        }

        foreach ($candidates as $candidate) {
            $exact = $this->filterOptions($options, static function (array $option) use ($candidate): bool {
                return $option['norm']['spaced'] !== '' && (
                    $option['norm']['spaced'] === $candidate['spaced']
                    || $option['norm']['compact'] === $candidate['compact']
                );
            });
            if ($exact !== []) {
                return $exact[0]['id'];
            }

            $prefix = $this->filterOptions($options, static function (array $option) use ($candidate): bool {
                $left = $option['norm']['compact'];
                $right = $candidate['compact'];
                if ($left === '' || $right === '' || strlen($left) < 5 || strlen($right) < 5) {
                    return false;
                }
                if (! str_starts_with($right, $left) && ! str_starts_with($left, $right)) {
                    return false;
                }

                return abs(strlen($left) - strlen($right)) <= 4;
            });
            if (count($prefix) === 1) {
                return $prefix[0]['id'];
            }
        }

        if ($group !== 'primenenie') {
            return null;
        }

        $needles = [];
        if ($this->isEveningLike($displayName, $valueSlug)) {
            $needles = ['vecher'];
        } elseif ($this->isEverydayLike($displayName, $valueSlug)) {
            $needles = ['kazhdyj den', 'povsednev', 'ezhednev', 'den'];
        }
        if ($needles === []) {
            return null;
        }

        $hits = $this->filterOptions($options, static function (array $option) use ($needles): bool {
            $spaced = $option['norm']['spaced'];
            if ($spaced === '') {
                return false;
            }
            foreach ($needles as $needle) {
                if ($spaced === $needle || str_contains($spaced, $needle)) {
                    return true;
                }
            }

            return false;
        });

        return $hits[0]['id'] ?? null;
    }

    /**
     * @param  list<array{id:int,name:string,active:bool,norm:array{spaced:string,sorted:string,compact:string,tokens:list<string>}}>  $options
     * @param  callable(array{id:int,name:string,active:bool,norm:array{spaced:string,sorted:string,compact:string,tokens:list<string>}}): bool  $predicate
     * @return list<array{id:int,name:string,active:bool,norm:array{spaced:string,sorted:string,compact:string,tokens:list<string>}}>
     */
    private function filterOptions(array $options, callable $predicate): array
    {
        $hits = [];
        foreach ($options as $option) {
            if (! $option['active'] || ! $predicate($option)) {
                continue;
            }
            $hits[] = $option;
        }
        usort($hits, static function (array $a, array $b): int {
            return strlen($a['norm']['spaced']) <=> strlen($b['norm']['spaced']) ?: $a['id'] <=> $b['id'];
        });

        return $hits;
    }

    private function countActiveProducts(?string $gender, int $attributeId, int $optionId): int
    {
        $query = DB::table('products')->where('products.is_active', true);
        if ($gender !== null) {
            $genderOptions = CatalogProductAttributeIds::genderOptionIdsForBucket($gender);
            if ($genderOptions === []) {
                return 0;
            }
            $this->whereHasAttributeOption($query, CatalogProductAttributeIds::GENDER_ATTRIBUTE_ID, $genderOptions);
        }
        $this->whereHasAttributeOption($query, $attributeId, [$optionId]);

        return (int) $query->count();
    }

    /**
     * @param  \Illuminate\Database\Query\Builder  $query
     * @param  list<int>  $optionIds
     */
    private function whereHasAttributeOption($query, int $attributeId, array $optionIds): void
    {
        $query->whereExists(function ($subQuery) use ($attributeId, $optionIds): void {
            $subQuery->selectRaw('1')
                ->from('product_attribute_values as pav')
                ->join(
                    'product_attribute_value_options as pavo',
                    'pavo.product_attribute_value_id',
                    '=',
                    'pav.id',
                )
                ->whereColumn('pav.product_id', 'products.id')
                ->where('pav.product_attribute_id', $attributeId)
                ->whereIn('pavo.product_attribute_option_id', $optionIds);
        });
    }

    /**
     * @param  array<string, mixed>  $plan
     * @return array{h1:string,seo_title:string,seo_description:?string,content:?string}
     */
    private function landingTexts(array $plan, ?ElParfumeRedirectMap $redirectMap): array
    {
        $description = $plan['description'];
        $h1 = '';
        $seoTitle = '';
        $seoDescription = '';
        $content = '';
        if (is_array($description)) {
            $h1 = $this->plainText((string) ($description['seo_h1'] ?? ''));
            $seoTitle = $this->plainText((string) ($description['seo_title'] ?? ''));
            $seoDescription = $this->plainText((string) ($description['seo_meta_description'] ?? ''));
            $content = $this->cleanContent((string) ($description['seo_description'] ?? ''), $redirectMap);
        }
        if ($h1 === '') {
            $h1 = $this->plainText((string) $plan['csv_h1']);
        }
        if ($seoTitle === '') {
            $seoTitle = $h1;
        }

        return [
            'h1' => $h1,
            'seo_title' => $seoTitle,
            'seo_description' => $seoDescription !== '' ? $seoDescription : null,
            'content' => $content !== '' ? $content : null,
        ];
    }

    private function plainText(string $value): string
    {
        $value = ElParfumeHtmlContent::decode($value);
        $value = trim(preg_replace('/\s+/u', ' ', $value) ?? $value);

        return $value;
    }

    private function cleanContent(string $value, ?ElParfumeRedirectMap $redirectMap): string
    {
        $value = ElParfumeHtmlContent::decode($value);
        $value = ElParfumeHtmlContent::normalizeNewlines($value);
        if ($redirectMap === null || $value === '') {
            return trim($value);
        }

        $value = ElParfumeHtmlContent::rewriteLinks($value, $redirectMap);
        $rewritten = preg_replace_callback(
            '#https?://(?:www\.)?el-parfume\.by[^\s<>"\']+#iu',
            static function (array $matches) use ($redirectMap): string {
                $raw = $matches[0];
                $trimmed = rtrim($raw, '.,);');
                $suffix = substr($raw, strlen($trimmed));
                $oldPath = ElParfumeHtmlContent::hrefToOldPath($trimmed);
                if ($oldPath === null) {
                    return $raw;
                }

                return ($redirectMap->targetForOldPath($oldPath) ?? '/catalog').$suffix;
            },
            $value,
        );

        return trim(is_string($rewritten) ? $rewritten : $value);
    }

    private function resolveRedirectMap(): ?ElParfumeRedirectMap
    {
        if ((bool) $this->option('no-link-rewrite')) {
            return null;
        }

        $mapPath = $this->resolvePath((string) $this->option('map'));
        if (! is_file($mapPath)) {
            $this->warn("Redirect map not found, keeping original links: {$mapPath}");

            return null;
        }

        return ElParfumeRedirectMap::fromCsvPath($mapPath);
    }

    private function genderTarget(?string $gender): string
    {
        if (in_array($gender, ['female', 'male', 'unisex'], true)) {
            return '/catalog?gender='.$gender;
        }

        return '/catalog';
    }

    /**
     * @param  list<array{old_path:string,target:string}>  $overrides
     */
    private function mergeOverrides(string $path, array $overrides): void
    {
        $dir = dirname($path);
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $header = ['old_path', 'target'];
        $rows = [];
        if (is_file($path) && filesize($path) > 0) {
            $existing = $this->readCsv($path);
            if ($existing !== []) {
                $header = array_keys($existing[0]);
            }
            if (! in_array('old_path', $header, true) || ! in_array('target', $header, true)) {
                $this->warn("Overrides CSV is missing old_path/target columns: {$path}");

                return;
            }
            foreach ($existing as $row) {
                $rows[] = $row;
            }
        }

        foreach ($overrides as $override) {
            $replaced = false;
            foreach ($rows as &$row) {
                if (trim((string) ($row['old_path'] ?? '')) === $override['old_path']) {
                    $row['target'] = $override['target'];
                    $replaced = true;
                }
            }
            unset($row);
            if (! $replaced) {
                $rows[] = [
                    'old_path' => $override['old_path'],
                    'target' => $override['target'],
                ];
            }
        }

        $handle = fopen($path, 'wb');
        if (! $handle) {
            $this->warn("Could not write overrides: {$path}");

            return;
        }
        fputcsv($handle, $header);
        foreach ($rows as $row) {
            $line = [];
            foreach ($header as $column) {
                $line[] = (string) ($row[$column] ?? '');
            }
            fputcsv($handle, $line);
        }
        fclose($handle);
    }

    /**
     * @param  list<array<string, string>>  $rows
     */
    private function writeReport(string $path, array $rows): void
    {
        $dir = dirname($path);
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $handle = fopen($path, 'wb');
        if (! $handle) {
            $this->warn("Could not write report: {$path}");

            return;
        }
        fputcsv($handle, self::REPORT_COLUMNS);
        foreach ($rows as $row) {
            $line = [];
            foreach (self::REPORT_COLUMNS as $column) {
                $line[] = (string) ($row[$column] ?? '');
            }
            fputcsv($handle, $line);
        }
        fclose($handle);
    }

    /**
     * @return list<array<string, string>>
     */
    private function readCsv(string $path): array
    {
        $handle = fopen($path, 'rb');
        if (! $handle) {
            return [];
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

    private function isActive(mixed $value): bool
    {
        return $value === true || $value === 1 || $value === '1';
    }

    private function resolvePath(string $path): string
    {
        $path = trim($path);
        if ($path === '' || $path[0] === DIRECTORY_SEPARATOR) {
            return $path;
        }

        return base_path($path);
    }
}

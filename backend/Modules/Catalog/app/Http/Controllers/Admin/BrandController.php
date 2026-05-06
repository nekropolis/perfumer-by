<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Modules\Catalog\Models\Brand;
use Modules\Catalog\Models\Product;
use Modules\ImportExport\Services\Vanille\Parsers\VanilleBrandParser;
use Modules\ImportExport\Support\VanilleHelper;
use Throwable;

class BrandController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Brand::query()
            ->withCount('products')
            ->orderBy('name');

        if ($request->filled('search')) {
            $search = trim($request->string('search')->toString());

            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('slug', 'like', "%{$search}%");
            });
        }

        $brands = $query->paginate(20);

        return response()->json($brands);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['required', 'string', 'max:255', 'unique:brands,slug'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $slug = VanilleHelper::slugify($validated['slug']);
        if (Product::query()->where('slug', $slug)->exists()) {
            return response()->json([
                'message' => 'Slug уже используется товаром',
            ], 422);
        }

        $brand = Brand::create([
            'name' => $validated['name'],
            'slug' => $slug,
            'seo_title' => $validated['name'],
            'seo_description' => null,
            'description' => null,
            'is_active' => $validated['is_active'] ?? true,
        ]);

        return response()->json([
            'message' => 'Бренд создан',
            'data' => $brand->loadCount('products'),
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $brand = Brand::query()->findOrFail($id);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => [
                'required',
                'string',
                'max:255',
                Rule::unique('brands', 'slug')->ignore($brand->id),
            ],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $slug = VanilleHelper::slugify($validated['slug']);
        if (Product::query()->where('slug', $slug)->exists()) {
            return response()->json([
                'message' => 'Slug уже используется товаром',
            ], 422);
        }

        $brand->update([
            'name' => $validated['name'],
            'slug' => $slug,
            'seo_title' => $validated['name'],
            'is_active' => $validated['is_active'] ?? $brand->is_active,
        ]);

        return response()->json([
            'message' => 'Бренд обновлён',
            'data' => $brand->fresh()->loadCount('products'),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $brand = Brand::query()
            ->withCount('products')
            ->findOrFail($id);

        return response()->json([
            'data' => $brand,
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $brand = Brand::query()->withCount('products')->findOrFail($id);

        if ($brand->products_count > 0) {
            return response()->json([
                'message' => 'Нельзя удалить бренд, к нему привязаны товары',
            ], 422);
        }

        $brand->delete();

        return response()->json([
            'message' => 'Бренд удалён',
        ]);
    }

    public function syncFromVanilleJson(): JsonResponse
    {
        $path = storage_path('app/public/imports/vanille/brands.json');

        if (!is_file($path)) {
            $this->writeBrandSyncAudit(
                AuditLogService::ACTION_ERROR,
                'Синхронизация брендов: файл brands.json не найден',
                [
                    'file_path' => $path,
                ],
            );

            return response()->json([
                'message' => 'Файл brands.json не найден',
            ], 404);
        }

        $decoded = json_decode((string) file_get_contents($path), true);

        if (!is_array($decoded)) {
            $this->writeBrandSyncAudit(
                AuditLogService::ACTION_ERROR,
                'Синхронизация брендов: некорректный формат brands.json',
                [
                    'file_path' => $path,
                ],
            );

            return response()->json([
                'message' => 'Некорректный формат brands.json',
            ], 422);
        }

        $decoded = VanilleBrandParser::filterExcludedListingRows($decoded);

        $existingNames = Brand::query()
            ->pluck('name')
            ->mapWithKeys(static fn ($name) => [mb_strtolower(trim((string) $name), 'UTF-8') => true])
            ->all();

        $usedSlugs = Brand::query()
            ->pluck('slug')
            ->mapWithKeys(static fn ($slug) => [mb_strtolower(trim((string) $slug), 'UTF-8') => true])
            ->all();
        foreach (Product::query()->pluck('slug') as $productSlug) {
            $usedSlugs[mb_strtolower(trim((string) $productSlug), 'UTF-8')] = true;
        }

        $created = 0;
        $skipped = 0;
        $pageNameCache = [];
        $pageLookups = 0;
        $maxPageLookups = 25;

        foreach ($decoded as $row) {
            $name = trim((string) data_get($row, 'name', ''));
            $slug = trim((string) data_get($row, 'slug', ''));
            $sourceUrl = trim((string) data_get($row, 'source_url', ''));
            $name = $this->normalizeBrandNameBySlug($name, $slug, $sourceUrl, $pageNameCache, $pageLookups, $maxPageLookups);

            if ($name === '') {
                $skipped++;
                continue;
            }

            if ($this->isGarbageBrandRow($name, $slug, $sourceUrl)) {
                $skipped++;
                continue;
            }

            $normalizedName = mb_strtolower($name, 'UTF-8');
            if (isset($existingNames[$normalizedName])) {
                $skipped++;
                continue;
            }

            $baseSlug = VanilleHelper::slugify($slug !== '' ? $slug : $name);
            if ($baseSlug === '') {
                $baseSlug = VanilleHelper::slugify($name);
            }
            if ($baseSlug === '') {
                $baseSlug = 'brand';
            }

            $slug = $this->resolveUniqueSlug($baseSlug, $usedSlugs);

            if (Brand::query()->where('slug', $slug)->exists()) {
                $skipped++;
                continue;
            }

            Brand::query()->create([
                'name' => $name,
                'slug' => $slug,
                'seo_title' => $name,
                'seo_description' => null,
                'description' => null,
                'is_active' => true,
            ]);

            $existingNames[$normalizedName] = true;
            $created++;
        }

        $summary = "Синхронизация брендов завершена: добавлено {$created}, пропущено {$skipped}";
        $this->writeBrandSyncAudit(
            AuditLogService::ACTION_SUCCESS,
            $summary,
            [
                'file_path' => $path,
                'created' => $created,
                'skipped' => $skipped,
                'rows_total' => count($decoded),
            ],
        );

        return response()->json([
            'message' => 'Синхронизация брендов завершена',
            'created' => $created,
            'skipped' => $skipped,
        ]);
    }

    private function resolveUniqueSlug(string $baseSlug, array &$usedSlugs): string
    {
        $candidate = $baseSlug;
        $index = 2;

        while (isset($usedSlugs[mb_strtolower($candidate, 'UTF-8')])) {
            $candidate = "{$baseSlug}-{$index}";
            $index++;
        }

        $usedSlugs[mb_strtolower($candidate, 'UTF-8')] = true;

        return $candidate;
    }

    private function writeBrandSyncAudit(string $action, string $summary, array $context = []): void
    {
        try {
            app(AuditLogService::class)->record(
                AuditLogService::ENTITY_BRAND_SYNC,
                null,
                $action,
                $summary,
                $context,
            );
        } catch (Throwable) {
        }
    }

    private function isGarbageBrandRow(string $name, string $slug, string $sourceUrl): bool
    {
        $normalizedName = mb_strtolower(trim($name), 'UTF-8');
        $normalizedSlug = mb_strtolower(trim($slug), 'UTF-8');
        $normalizedSourceUrl = mb_strtolower(trim($sourceUrl), 'UTF-8');

        // Телефоны, цифровые категории и контакты не являются брендами
        if (preg_match('/\+?\d[\d\s\-\(\)]{6,}\d/u', $normalizedName) === 1) {
            return true;
        }
        if ($normalizedSlug !== '' && preg_match('/^\+?\d{6,}$/u', $normalizedSlug) === 1) {
            return true;
        }

        if (str_contains($normalizedName, '@')) {
            return true;
        }

        $keywords = [
            'telegram', 'телеграм', 'бот', 'viber', 'whatsapp', 'instagram', 'инстаграм',
            'контакт', 'доставка', 'оплата', 'обработка обращений', 'подар', 'сертификат',
            'sale', 'акции', 'отливант', 'остатки', 'атомайзер',
        ];

        $excludedNames = [
            'лимитированные издания',
            'ароматы 2024 года',
            'ароматы 2023 года',
            'духи от знаменитостей',
            'классика',
            'арабская парфюмерия',
            'топ 100 женских',
            'топ 100 мужских',
            'топ 100 унисекс',
            'парфюмерия',
            'для женщин',
            'для мужчин',
            'унисекс',
            'лидеры продаж',
            'новинки',
            'люкс/элитная',
            'селективная/нишевая',
            'свидетельство о регистрации',
            'условия возврата',
            'обработка обращений',
            'духи',
            'парфюмерная вода',
            'туалетная вода',
            'одеколоны',
            'пробники',
        ];

        $excludedSlugs = [
            'limited-edition',
            'aromat-2024',
            'aromat-2023',
            'celebrity',
            'klassika',
            'arabskaya',
            'top-100-women',
            'top-100-men',
            'top-100-unisex',
            'catalog',
            'parfumeriya-dlya-zhenshhin',
            'parfumeriya-dlya-muzhchin',
            'parfumeriya-uniseks',
            'lideryi-prodazh',
            'novinki',
            'lyuks',
            'selektivnaya',
            'svidetelstvo',
            'pravila',
            'poryadok-obrabotki-obrashhenij',
            'duxi',
            'tualetnyie-duxi',
            'tualetnaya-voda',
            'odekolonyi',
            'probniki',
        ];

        if (in_array($normalizedName, $excludedNames, true) || in_array($normalizedSlug, $excludedSlugs, true)) {
            return true;
        }

        foreach ($keywords as $keyword) {
            if (
                ($normalizedName !== '' && str_contains($normalizedName, $keyword))
                || ($normalizedSlug !== '' && str_contains($normalizedSlug, $keyword))
                || ($normalizedSourceUrl !== '' && str_contains($normalizedSourceUrl, $keyword))
            ) {
                return true;
            }
        }

        return false;
    }

    private function normalizeBrandNameBySlug(
        string $name,
        string $slug,
        string $sourceUrl = '',
        array &$pageNameCache = [],
        int &$pageLookups = 0,
        int $maxPageLookups = 0,
    ): string {
        $trimmedName = trim($name);
        if ($trimmedName === '' || trim($slug) === '') {
            return $trimmedName;
        }

        $normalizedSlug = VanilleHelper::slugify($slug);
        if ($normalizedSlug === '') {
            return $trimmedName;
        }

        if ($this->shouldTryResolveBrandNameFromPage($trimmedName, $normalizedSlug)) {
            $cacheKey = trim($sourceUrl);

            if ($cacheKey !== '' && array_key_exists($cacheKey, $pageNameCache)) {
                $nameFromPage = $pageNameCache[$cacheKey];
            } elseif ($cacheKey !== '' && ($maxPageLookups <= 0 || $pageLookups < $maxPageLookups)) {
                $nameFromPage = $this->resolveBrandNameFromPage($cacheKey);
                $pageNameCache[$cacheKey] = $nameFromPage;
                $pageLookups++;
            } else {
                $nameFromPage = null;
            }

            if (is_string($nameFromPage) && VanilleHelper::slugify($nameFromPage) === $normalizedSlug) {
                return $nameFromPage;
            }
        }

        $nameParts = preg_split('/\s+/u', $trimmedName) ?: [];
        if (count($nameParts) === 2) {
            $reversed = trim($nameParts[1] . ' ' . $nameParts[0]);
            if (VanilleHelper::slugify($reversed) === $normalizedSlug) {
                return $reversed;
            }
        }

        return $trimmedName;
    }

    private function shouldTryResolveBrandNameFromPage(string $name, string $normalizedSlug): bool
    {
        if ($name === '' || $normalizedSlug === '') {
            return false;
        }

        if (VanilleHelper::slugify($name) === $normalizedSlug) {
            return false;
        }

        $parts = preg_split('/\s+/u', trim($name)) ?: [];

        return count($parts) === 2;
    }

    private function resolveBrandNameFromPage(string $sourceUrl): ?string
    {
        $url = trim($sourceUrl);
        if ($url === '' || !preg_match('/^https?:\/\//i', $url)) {
            return null;
        }

        try {
            $context = stream_context_create([
                'http' => [
                    'method' => 'GET',
                    'timeout' => 1,
                    'header' => "User-Agent: Mozilla/5.0\r\n",
                ],
            ]);
            $html = @file_get_contents($url, false, $context);
            if (!is_string($html) || $html === '') {
                return null;
            }

            if (preg_match('/<h1[^>]*>(.*?)<\/h1>/isu', $html, $h1Match)) {
                $h1 = trim(strip_tags(html_entity_decode((string) $h1Match[1], ENT_QUOTES | ENT_HTML5, 'UTF-8')));
                $h1 = preg_replace('/\s+парфюм$/iu', '', $h1) ?: $h1;
                $h1 = trim((string) $h1);
                if ($h1 !== '' && mb_strlen($h1) <= 120) {
                    return $h1;
                }
            }
        } catch (Throwable) {
        }

        return null;
    }
}

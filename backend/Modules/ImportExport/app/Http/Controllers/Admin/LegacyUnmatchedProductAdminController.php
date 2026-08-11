<?php

namespace Modules\ImportExport\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Services\CatalogProductLinkSearchService;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\ImportExport\Support\LegacyDumpOcReviewExtractor;
use Modules\Reviews\Models\Review;

class LegacyUnmatchedProductAdminController extends Controller
{
    public function __construct(
        private readonly CatalogProductLinkSearchService $linkSearchService,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $query = DB::table('legacy_unmatched_products as lup')
            ->leftJoin('products as p', 'p.id', '=', 'lup.linked_product_id')
            ->leftJoin('brands', 'brands.id', '=', 'p.brand_id')
            ->select([
                'lup.id',
                'lup.legacy_product_id',
                'lup.legacy_slug',
                'lup.legacy_name',
                'lup.status',
                'lup.skip_reason',
                'lup.linked_at',
                'lup.linked_product_id',
                'p.name as linked_product_name',
                'p.slug as linked_product_slug',
                'brands.name as linked_brand_name',
            ]);

        if ($request->filled('status')) {
            $status = (string) $request->input('status');
            if (in_array($status, ['unmatched', 'linked', 'skipped'], true)) {
                $query->where('lup.status', $status);
            }
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($q) use ($search): void {
                $q->where('lup.legacy_slug', 'like', "%{$search}%")
                    ->orWhere('lup.legacy_name', 'like', "%{$search}%")
                    ->orWhere('lup.legacy_product_id', 'like', "%{$search}%");
            });
        }

        $items = $query
            ->orderBy('lup.status')
            ->orderByDesc('lup.id')
            ->paginate((int) $request->input('per_page', 25));

        return response()->json($items);
    }

    public function show(int $id): JsonResponse
    {
        $item = DB::table('legacy_unmatched_products')
            ->where('id', $id)
            ->first();

        abort_unless($item, 404, 'Legacy product not found');

        return response()->json(['data' => $item]);
    }

    public function targetSearch(Request $request, int $id): JsonResponse
    {
        $legacy = DB::table('legacy_unmatched_products')->where('id', $id)->first();
        abort_unless($legacy, 404, 'Legacy product not found');

        $q = trim((string) $request->query('q', ''));
        if (mb_strlen($q, 'UTF-8') < 2) {
            return response()->json(['data' => []]);
        }

        $productsQuery = Product::query()
            ->select(['products.id', 'products.name', 'products.slug', 'products.brand_id'])
            ->with(['brand:id,name'])
            ->whereNotIn('products.id', function ($sub): void {
                $sub->from('legacy_unmatched_products')
                    ->select('linked_product_id')
                    ->where('status', '=', 'linked')
                    ->whereNotNull('linked_product_id');
            })
            ->whereNotIn('products.id', function ($sub): void {
                $sub->from('legacy_map_products')
                    ->select('product_id')
                    ->where('status', '=', 'matched')
                    ->whereNotNull('product_id');
            });

        $this->linkSearchService->applyAdminProductListSearch($productsQuery, $q);

        $data = $productsQuery
            ->orderBy('products.name')
            ->limit(25)
            ->get()
            ->map(static function (Product $product): array {
                return [
                    'id' => (int) $product->id,
                    'name' => (string) $product->name,
                    'slug' => (string) $product->slug,
                    'brand_name' => $product->brand?->name !== null ? (string) $product->brand->name : null,
                ];
            })
            ->values()
            ->all();

        return response()->json(['data' => $data]);
    }

    public function link(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'target_product_id' => ['required', 'integer', 'exists:products,id'],
            'confirm_replace' => ['required', 'boolean'],
        ]);

        if (! $validated['confirm_replace']) {
            return response()->json(['message' => 'confirm_replace must be true'], 422);
        }

        $actorId = $request->user()?->id;

        DB::transaction(function () use ($id, $validated, $actorId): void {
            $legacy = DB::table('legacy_unmatched_products')
                ->where('id', $id)
                ->lockForUpdate()
                ->first();
            abort_unless($legacy, 404, 'Legacy product not found');

            if ($legacy->status !== 'unmatched') {
                abort(response()->json(['message' => 'Only unmatched records can be linked'], 422));
            }

            $targetProductId = (int) $validated['target_product_id'];

            $targetAlreadyLinked = DB::table('legacy_unmatched_products')
                ->where('status', 'linked')
                ->where('linked_product_id', $targetProductId)
                ->exists();
            if ($targetAlreadyLinked) {
                abort(response()->json(['message' => 'Target product already linked to another legacy product'], 422));
            }

            $targetAlreadyMatched = DB::table('legacy_map_products')
                ->where('status', 'matched')
                ->where('product_id', $targetProductId)
                ->exists();
            if ($targetAlreadyMatched) {
                abort(response()->json(['message' => 'Target product already used in matched mapping'], 422));
            }

            /** @var Product $target */
            $target = Product::query()->with('brand:id,name')->findOrFail($targetProductId);

            $legacyTitle = trim((string) ($legacy->legacy_name ?? ''));
            $brandName = trim((string) ($target->brand?->name ?? ''));
            $normalized = $legacyTitle !== ''
                ? ProductDisplayName::normalizeLegacyProductTitle($legacyTitle, $brandName)
                : null;

            $before = [
                'name' => $target->name,
                'h1' => $target->h1,
                'description' => $target->description,
                'seo_title' => $target->seo_title,
                'seo_description' => $target->seo_description,
                'seo_keyword' => $target->seo_keyword,
            ];

            $updatePayload = [
                'description' => $legacy->legacy_description,
                'seo_title' => $legacy->legacy_meta_title ?: ($normalized['display_name'] ?? $target->h1),
                'seo_description' => $legacy->legacy_meta_description,
                'seo_keyword' => $legacy->legacy_meta_keyword,
            ];
            if ($normalized !== null) {
                $updatePayload['name'] = $normalized['short_name'];
                $updatePayload['h1'] = $normalized['display_name'];
            }

            $target->update($updatePayload);
            $target->refresh();

            $fromPath = $this->normalizePath($legacy->legacy_slug ? '/'.$legacy->legacy_slug : '/');
            $toPath = '/'.$target->slug;

            $redirect = DB::table('seo_redirects')
                ->where('from_path', $fromPath)
                ->first();

            if ($redirect) {
                DB::table('seo_redirects')
                    ->where('id', $redirect->id)
                    ->update([
                        'to_path' => $toPath,
                        'http_code' => 301,
                        'is_active' => true,
                        'source' => 'legacy_product_link',
                        'legacy_entity_type' => 'product',
                        'legacy_entity_id' => (int) $legacy->legacy_product_id,
                        'updated_at' => now(),
                    ]);
                $redirectId = (int) $redirect->id;
            } else {
                $redirectId = (int) DB::table('seo_redirects')->insertGetId([
                    'from_path' => $fromPath,
                    'to_path' => $toPath,
                    'http_code' => 301,
                    'is_active' => true,
                    'source' => 'legacy_product_link',
                    'legacy_entity_type' => 'product',
                    'legacy_entity_id' => (int) $legacy->legacy_product_id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            $after = [
                'name' => $target->name,
                'h1' => $target->h1,
                'description' => $target->description,
                'seo_title' => $target->seo_title,
                'seo_description' => $target->seo_description,
                'seo_keyword' => $target->seo_keyword,
            ];

            $legacyReviews = LegacyDumpOcReviewExtractor::decodeStagedReviewsJson($legacy->legacy_reviews ?? '[]');
            foreach ($legacyReviews as $legacyReview) {
                $legacyReviewId = (int) ($legacyReview['legacy_review_id'] ?? 0);
                if ($legacyReviewId <= 0) {
                    continue;
                }

                $alreadyMapped = DB::table('legacy_map_reviews')
                    ->where('legacy_review_id', $legacyReviewId)
                    ->whereNotNull('review_id')
                    ->exists();
                if ($alreadyMapped) {
                    continue;
                }

                $status = ((int) ($legacyReview['legacy_status'] ?? 0)) === 1
                    ? Review::STATUS_PUBLISHED
                    : Review::STATUS_PENDING;
                $createdAt = $this->nullableDateTime($legacyReview['created_at'] ?? null);
                $updatedAt = $this->nullableDateTime($legacyReview['updated_at'] ?? null);
                [$reviewBody, $replyFromBody] = $this->splitReviewAndReplyFromBody((string) ($legacyReview['body'] ?? ''));
                $replyText = trim((string) ($legacyReview['reply_text'] ?? ''));
                if ($replyText === '' && $replyFromBody !== null) {
                    $replyText = $replyFromBody;
                }
                $repliedAt = $replyText !== ''
                    ? $this->nullableDateTime($legacyReview['replied_at'] ?? null) ?? $updatedAt ?? $createdAt ?? now()
                    : null;

                $reviewId = (int) DB::table('reviews')->insertGetId([
                    'type' => Review::TYPE_PRODUCT,
                    'product_id' => $target->id,
                    'name' => trim((string) ($legacyReview['author'] ?? '')) !== ''
                        ? (string) $legacyReview['author']
                        : 'Покупатель',
                    'body' => trim($reviewBody) !== ''
                        ? $reviewBody
                        : 'Без текста',
                    'stars' => max(1, min(5, (int) ($legacyReview['stars'] ?? 5))),
                    'status' => $status,
                    'published_at' => $status === Review::STATUS_PUBLISHED ? $createdAt : null,
                    'reply_text' => $replyText !== '' ? $replyText : null,
                    'replied_at' => $repliedAt,
                    'created_at' => $createdAt ?? now(),
                    'updated_at' => $updatedAt ?? $createdAt ?? now(),
                ]);

                DB::table('legacy_map_reviews')->updateOrInsert(
                    ['legacy_review_id' => $legacyReviewId],
                    [
                        'legacy_product_id' => (int) $legacy->legacy_product_id,
                        'review_id' => $reviewId,
                        'status' => 'imported_after_link',
                        'type' => Review::TYPE_PRODUCT,
                        'note' => 'Imported during manual product link',
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]
                );
            }

            DB::table('legacy_unmatched_products')
                ->where('id', $id)
                ->update([
                    'status' => 'linked',
                    'linked_product_id' => $target->id,
                    'redirect_id' => $redirectId,
                    'linked_by_user_id' => $actorId,
                    'linked_at' => now(),
                    'sync_snapshot' => json_encode(['before' => $before, 'after' => $after], JSON_UNESCAPED_UNICODE),
                    'legacy_reviews' => json_encode([], JSON_UNESCAPED_UNICODE),
                    'updated_at' => now(),
                ]);
        });

        return response()->json(['message' => 'Legacy product linked, redirect created, product fields replaced']);
    }

    public function skip(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:2000'],
        ]);

        $updated = DB::table('legacy_unmatched_products')
            ->where('id', $id)
            ->where('status', 'unmatched')
            ->update([
                'status' => 'skipped',
                'skip_reason' => $validated['reason'],
                'updated_at' => now(),
            ]);

        if (! $updated) {
            return response()->json(['message' => 'Only unmatched records can be skipped'], 422);
        }

        return response()->json(['message' => 'Legacy product skipped']);
    }

    private function normalizePath(string $path): string
    {
        $trimmed = trim($path);
        if ($trimmed === '') {
            return '/';
        }

        return str_starts_with($trimmed, '/') ? $trimmed : '/'.$trimmed;
    }

    private function nullableDateTime(mixed $value): ?string
    {
        $trim = trim((string) $value);
        if ($trim === '' || $trim === '0000-00-00 00:00:00') {
            return null;
        }
        return $trim;
    }

    /**
     * @return array{0:string,1:?string}
     */
    private function splitReviewAndReplyFromBody(string $body): array
    {
        if (trim($body) === '') {
            return ['', null];
        }

        // Поддерживаем оба формата: реальные переводы строк и буквальные "\r\n"/"\n".
        $normalized = str_replace(["\\r\\n", "\\n", "\r\n", "\r"], "\n", $body);
        $parts = preg_split('/\n_{5,}\n/u', $normalized, 2);

        if (! is_array($parts) || count($parts) < 2) {
            return [trim($body), null];
        }

        $reviewText = trim($parts[0] ?? '');
        $replyText = trim($parts[1] ?? '');

        return [$reviewText, $replyText !== '' ? $replyText : null];
    }
}

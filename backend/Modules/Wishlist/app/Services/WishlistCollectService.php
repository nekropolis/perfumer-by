<?php

namespace Modules\Wishlist\Services;

use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Services\ProductViewService;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\Users\Support\SanctumActor;
use Modules\Wishlist\Models\ProductDailyWishlist;

final class WishlistCollectService
{
    /**
     * @param  list<int>  $productIds
     */
    public function record(array $productIds, Request $request): void
    {
        if (SanctumActor::isStaff($request)) {
            return;
        }

        $ids = array_values(array_unique(array_filter(
            $productIds,
            static fn (int $id): bool => $id > 0,
        )));
        if ($ids === []) {
            return;
        }

        $now = Carbon::now(ProductViewService::TIMEZONE);
        $date = $now->toDateString();
        $visitor = hash('sha256', $request->ip().'|'.(string) $request->userAgent());

        foreach ($ids as $productId) {
            $this->recordOne($productId, $date, $visitor, $now);
        }
    }

    private function recordOne(int $productId, string $date, string $visitor, Carbon $now): void
    {
        $cacheKey = 'wishlist-add:'.$date.':'.$productId.':'.$visitor;

        if (! Cache::add($cacheKey, 1, $now->copy()->endOfDay())) {
            return;
        }

        try {
            $updated = ProductDailyWishlist::query()
                ->where('product_id', $productId)
                ->whereDate('wished_on', $date)
                ->increment('wishlists_count');

            if ($updated === 0) {
                ProductDailyWishlist::query()->create([
                    'product_id' => $productId,
                    'wished_on' => $date,
                    'wishlists_count' => 1,
                ]);
            }
        } catch (UniqueConstraintViolationException) {
            ProductDailyWishlist::query()
                ->where('product_id', $productId)
                ->whereDate('wished_on', $date)
                ->increment('wishlists_count');
        } catch (\Throwable) {
            Cache::forget($cacheKey);
        }
    }

    /**
     * @return list<array{id: int, name: string, slug: string|null, wishlists_count: int}>
     */
    public function top(string $period, int $limit = ProductViewService::TOP_VIEWED_LIMIT): array
    {
        $views = app(ProductViewService::class);
        $period = $views->resolveViewsPeriod($period);
        [$from, $to] = $views->viewsPeriodRange($period);
        $limit = max(1, $limit);

        $guest = DB::table('product_daily_wishlists')
            ->select('product_id', DB::raw('SUM(wishlists_count) as cnt'))
            ->whereBetween('wished_on', [$from->toDateString(), $to->toDateString()])
            ->groupBy('product_id');

        $clients = DB::table('wishlist_items')
            ->select('product_id', DB::raw('COUNT(*) as cnt'))
            ->whereBetween('created_at', [
                $from->utc()->toDateTimeString(),
                $to->utc()->toDateTimeString(),
            ])
            ->groupBy('product_id');

        $rows = DB::query()
            ->fromSub($guest->unionAll($clients), 'w')
            ->join('products', 'products.id', '=', 'w.product_id')
            ->leftJoin('brands', 'brands.id', '=', 'products.brand_id')
            ->groupBy('w.product_id')
            ->orderByDesc(DB::raw('SUM(w.cnt)'))
            ->orderBy('w.product_id')
            ->limit($limit)
            ->get([
                'w.product_id as id',
                DB::raw('MAX(products.name) as name'),
                DB::raw('MAX(products.slug) as slug'),
                DB::raw('MAX(brands.name) as brand_name'),
                DB::raw('SUM(w.cnt) as wishlists_count'),
            ]);

        return $rows
            ->map(static function (object $row): array {
                $slug = is_string($row->slug) && $row->slug !== '' ? $row->slug : null;

                return [
                    'id' => (int) $row->id,
                    'name' => ProductDisplayName::format(
                        is_string($row->brand_name) ? $row->brand_name : null,
                        (string) $row->name,
                    ),
                    'slug' => $slug,
                    'wishlists_count' => (int) $row->wishlists_count,
                ];
            })
            ->values()
            ->all();
    }
}

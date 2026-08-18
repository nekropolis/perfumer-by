<?php

namespace Modules\Catalog\Services;

use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\ProductDailyView;
use Modules\Catalog\Models\ProductViewSnapshot;

final class ProductViewService
{
    public const string TIMEZONE = 'Europe/Minsk';

    private const int WINDOW_DAYS = 30;

    private const int SNAPSHOT_SIZE = 8;

    public const int MIN_TO_SHOW = 4;

    private const int PRUNE_VIEWS_AFTER_DAYS = 40;

    private const int SNAPSHOT_KEEP_DAYS = 365;

    public function record(int $productId, Request $request): void
    {
        if ($productId <= 0) {
            return;
        }

        $now = Carbon::now(self::TIMEZONE);
        $date = $now->toDateString();
        $visitor = hash('sha256', $request->ip().'|'.(string) $request->userAgent());
        $cacheKey = 'product-view:'.$date.':'.$productId.':'.$visitor;

        if (! Cache::add($cacheKey, 1, $now->copy()->endOfDay())) {
            return;
        }

        try {
            $updated = ProductDailyView::query()
                ->where('product_id', $productId)
                ->whereDate('viewed_on', $date)
                ->increment('views_count');

            if ($updated === 0) {
                ProductDailyView::query()->create([
                    'product_id' => $productId,
                    'viewed_on' => $date,
                    'views_count' => 1,
                ]);
            }
        } catch (UniqueConstraintViolationException) {
            ProductDailyView::query()
                ->where('product_id', $productId)
                ->whereDate('viewed_on', $date)
                ->increment('views_count');
        } catch (\Throwable) {
            Cache::forget($cacheKey);
        }
    }

    public function refreshSnapshot(): int
    {
        $now = Carbon::now(self::TIMEZONE);
        $from = $now->copy()->subDays(self::WINDOW_DAYS)->toDateString();

        $rows = DB::table('product_daily_views as v')
            ->join('products', 'products.id', '=', 'v.product_id')
            ->where('products.is_active', true)
            ->where('v.viewed_on', '>=', $from)
            ->whereExists(function ($query): void {
                $query->selectRaw('1')
                    ->from('product_variant_links')
                    ->whereColumn('product_variant_links.product_id', 'products.id')
                    ->where('product_variant_links.is_active', true)
                    ->whereNotNull('product_variant_links.price');
            })
            ->groupBy('v.product_id')
            ->orderByDesc(DB::raw('SUM(v.views_count)'))
            ->get([
                'v.product_id',
                DB::raw('SUM(v.views_count) as views_total'),
            ]);

        $ids = $this->pickTopWithRandomTies($rows, self::SNAPSHOT_SIZE);
        $snapshotOn = $now->toDateString();

        DB::transaction(function () use ($ids, $snapshotOn, $now): void {
            DB::table('product_view_snapshots')->where('snapshot_on', $snapshotOn)->delete();

            $rows = [];
            foreach (array_values($ids) as $index => $productId) {
                $rows[] = [
                    'snapshot_on' => $snapshotOn,
                    'position' => $index + 1,
                    'product_id' => (int) $productId,
                ];
            }
            if ($rows !== []) {
                DB::table('product_view_snapshots')->insert($rows);
            }

            DB::table('product_view_snapshots')
                ->where('snapshot_on', '<', $now->copy()->subDays(self::SNAPSHOT_KEEP_DAYS)->toDateString())
                ->delete();
        });

        ProductDailyView::query()
            ->where('viewed_on', '<', $now->copy()->subDays(self::PRUNE_VIEWS_AFTER_DAYS)->toDateString())
            ->delete();

        return count($ids);
    }

    /**
     * @return list<int>
     */
    public function snapshotProductIds(): array
    {
        $latest = ProductViewSnapshot::query()->max('snapshot_on');
        if ($latest === null) {
            return [];
        }

        return ProductViewSnapshot::query()
            ->whereDate('snapshot_on', $latest)
            ->orderBy('position')
            ->pluck('product_id')
            ->map(static fn ($id): int => (int) $id)
            ->values()
            ->all();
    }

    /**
     * @param  Collection<int, object>  $rows
     * @return list<int>
     */
    private function pickTopWithRandomTies(Collection $rows, int $limit): array
    {
        $groups = $rows
            ->groupBy(static fn (object $row): string => (string) (int) $row->views_total)
            ->sortKeysDesc();

        $picked = [];
        foreach ($groups as $group) {
            $need = $limit - count($picked);
            if ($need <= 0) {
                break;
            }

            $ids = $group->pluck('product_id')->map(static fn ($id): int => (int) $id)->values()->all();
            if (count($ids) <= $need) {
                $picked = array_merge($picked, $ids);
                continue;
            }

            shuffle($ids);
            $picked = array_merge($picked, array_slice($ids, 0, $need));
            break;
        }

        return $picked;
    }
}

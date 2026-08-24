<?php

namespace Modules\Catalog\Services;

use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\ProductDailyView;
use Modules\Catalog\Models\ProductViewSnapshot;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\Settings\Services\ShopSettingService;
use Modules\Users\Support\SanctumActor;

final class ProductViewService
{
    public const string TIMEZONE = 'Europe/Minsk';

    private const int WINDOW_DAYS = 30;

    private const int SNAPSHOT_SIZE = 8;

    public const int MIN_TO_SHOW = 4;

    public const int PRUNE_VIEWS_AFTER_DAYS = 400;

    public const int TOP_VIEWED_LIMIT = 10;

    /** @var list<string> */
    public const array VIEW_PERIODS = ['day', 'week', 'month', 'quarter', 'year'];

    private const int SNAPSHOT_KEEP_DAYS = 365;

    public const string HOME_HERO_PRODUCT_ID_KEY = 'home_hero_product_id';

    public const string HOME_HERO_SELECTED_ON_KEY = 'home_hero_selected_on';

    public const int HERO_ROTATION_DAYS = 3;

    public function record(int $productId, Request $request): void
    {
        if ($productId <= 0 || SanctumActor::isStaff($request)) {
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
        $ids = $this->pickTopWithRandomTies($this->rankedViewRows($now), self::SNAPSHOT_SIZE);
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
     * Товар с максимумом просмотров за 30 дней; при ничьей — случайный.
     * Ротация раз в {@see HERO_ROTATION_DAYS} дней (ночью по cron).
     */
    public function refreshHeroFeatured(bool $force = false): ?int
    {
        $settings = app(ShopSettingService::class);
        $now = Carbon::now(self::TIMEZONE);

        if (! $force) {
            $selectedOnRaw = $settings->get(self::HOME_HERO_SELECTED_ON_KEY);
            if (is_string($selectedOnRaw) && $selectedOnRaw !== '') {
                $selectedOn = Carbon::parse($selectedOnRaw, self::TIMEZONE)->startOfDay();
                $daysPassed = $selectedOn->diffInDays($now->copy()->startOfDay());
                if ($daysPassed < self::HERO_ROTATION_DAYS) {
                    $existing = (int) $settings->get(self::HOME_HERO_PRODUCT_ID_KEY, '0');

                    return $existing > 0 ? $existing : null;
                }
            }
        }

        $ids = $this->pickTopWithRandomTies($this->rankedViewRows($now), 1);
        $productId = $ids[0] ?? null;
        if ($productId === null) {
            return null;
        }

        $settings->setMany([
            self::HOME_HERO_PRODUCT_ID_KEY => $productId,
            self::HOME_HERO_SELECTED_ON_KEY => $now->toDateString(),
        ]);

        return $productId;
    }

    public function heroProductId(): ?int
    {
        $settings = app(ShopSettingService::class);
        $id = (int) $settings->get(self::HOME_HERO_PRODUCT_ID_KEY, '0');
        if ($id > 0) {
            return $id;
        }

        return $this->refreshHeroFeatured(true);
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
     * @return list<array{id: int, name: string, slug: string|null, views_count: int}>
     */
    public function topViewed(string $period, int $limit = self::TOP_VIEWED_LIMIT): array
    {
        [$from, $to] = $this->viewsPeriodRange($period);
        $limit = max(1, $limit);

        $rows = DB::table('product_daily_views as v')
            ->join('products', 'products.id', '=', 'v.product_id')
            ->leftJoin('brands', 'brands.id', '=', 'products.brand_id')
            ->whereBetween('v.viewed_on', [$from->toDateString(), $to->toDateString()])
            ->groupBy('v.product_id')
            ->orderByDesc(DB::raw('SUM(v.views_count)'))
            ->orderBy('v.product_id')
            ->limit($limit)
            ->get([
                'v.product_id as id',
                DB::raw('MAX(products.name) as name'),
                DB::raw('MAX(products.slug) as slug'),
                DB::raw('MAX(brands.name) as brand_name'),
                DB::raw('SUM(v.views_count) as views_count'),
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
                    'views_count' => (int) $row->views_count,
                ];
            })
            ->values()
            ->all();
    }

    public function resolveViewsPeriod(string $period): string
    {
        return in_array($period, self::VIEW_PERIODS, true) ? $period : 'month';
    }

    /**
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    public function viewsPeriodRange(string $period): array
    {
        $period = $this->resolveViewsPeriod($period);
        $now = CarbonImmutable::now(self::TIMEZONE);
        $to = $now->endOfDay();

        $from = match ($period) {
            'day' => $now->startOfDay(),
            'week' => $now->startOfWeek(CarbonImmutable::MONDAY),
            'month' => $now->startOfMonth(),
            'quarter' => $now->startOfQuarter(),
            'year' => $now->startOfYear(),
            default => $now->startOfMonth(),
        };

        return [$from, $to];
    }

    /**
     * @return Collection<int, object>
     */
    private function rankedViewRows(Carbon $now): Collection
    {
        $from = $now->copy()->subDays(self::WINDOW_DAYS)->toDateString();

        return DB::table('product_daily_views as v')
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

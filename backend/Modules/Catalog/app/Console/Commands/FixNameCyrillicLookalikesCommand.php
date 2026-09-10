<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Support\ProductDisplayName;

class FixNameCyrillicLookalikesCommand extends Command
{
    protected $signature = 'catalog:products:fix-name-lookalikes
                            {--dry-run : Показать изменения без записи в БД}';

    protected $description = 'Заменить кириллические двойники латиницы в products.name (Musс → Musc)';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        if ($dryRun) {
            $this->info('Режим dry-run: изменения в БД не применяются.');
        }

        $products = Product::query()
            ->whereNotNull('name')
            ->where('name', '!=', '')
            ->orderBy('id')
            ->get(['id', 'name']);

        $changes = [];
        foreach ($products as $product) {
            $current = (string) $product->name;
            $next = ProductDisplayName::replaceCyrillicLookalikes($current);
            if ($next === $current) {
                continue;
            }
            $changes[] = [
                'id' => (int) $product->id,
                'old' => $current,
                'new' => $next,
            ];
        }

        if ($changes === []) {
            $this->info('name: кириллических двойников в латинских словах нет.');

            return self::SUCCESS;
        }

        $this->info('name — будут обновлены ('.count($changes).'):');
        $this->table(
            ['id', 'name (было)', 'name (станет)'],
            array_map(
                static fn (array $row): array => [$row['id'], $row['old'], $row['new']],
                array_slice($changes, 0, 40)
            )
        );
        if (count($changes) > 40) {
            $this->line('… и ещё '.(count($changes) - 40));
        }

        if ($dryRun) {
            return self::SUCCESS;
        }

        DB::transaction(function () use ($changes): void {
            foreach ($changes as $row) {
                Product::query()->whereKey($row['id'])->update(['name' => $row['new']]);
            }
        });

        $this->info('Обновлено name: '.count($changes));

        return self::SUCCESS;
    }
}

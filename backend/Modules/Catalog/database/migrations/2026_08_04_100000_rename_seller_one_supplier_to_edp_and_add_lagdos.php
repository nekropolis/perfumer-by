<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\SellerOneMatchRule;
use Modules\Catalog\Models\Supplier;

return new class extends Migration
{
    public function up(): void
    {
        $xls = Supplier::query()->where('code', 'supplier-price-xls')->first();
        $byCode = Supplier::query()->where('code', 'edp')->first();

        if ($xls !== null) {
            // Имя «EDP» уже занято другой записью (unique) — освобождаем слот.
            $nameConflict = Supplier::query()
                ->where('name', 'EDP')
                ->where('id', '!=', $xls->id)
                ->first();
            if ($nameConflict !== null) {
                $nameConflict->update([
                    'name' => $this->uniqueSupplierName((string) $nameConflict->name, (int) $nameConflict->id),
                ]);
            }

            // Код edp уже занят другой записью — освобождаем слот.
            if ($byCode !== null && (int) $byCode->id !== (int) $xls->id) {
                $byCode->update([
                    'code' => $this->uniqueSupplierCode('edp', (int) $byCode->id),
                ]);
            }

            $xls->update([
                'code' => 'edp',
                'name' => 'EDP',
                'is_active' => true,
            ]);
            $edp = $xls->fresh();
        } elseif ($byCode !== null) {
            $nameConflict = Supplier::query()
                ->where('name', 'EDP')
                ->where('id', '!=', $byCode->id)
                ->first();
            if ($nameConflict !== null) {
                $nameConflict->update([
                    'name' => $this->uniqueSupplierName((string) $nameConflict->name, (int) $nameConflict->id),
                ]);
            }

            $byCode->update([
                'name' => 'EDP',
                'is_active' => true,
            ]);
            $edp = $byCode->fresh();
        } else {
            $nameConflict = Supplier::query()->where('name', 'EDP')->first();
            if ($nameConflict !== null) {
                // Переиспользуем существующую запись с именем EDP как прайс-поставщика.
                $nameConflict->update([
                    'code' => 'edp',
                    'is_active' => true,
                ]);
                $edp = $nameConflict->fresh();
            } else {
                $edp = Supplier::query()->create([
                    'code' => 'edp',
                    'name' => 'EDP',
                    'is_active' => true,
                ]);
            }
        }

        SellerOneMatchRule::query()
            ->where('supplier_id', $edp->id)
            ->update(['supplier_id' => $edp->id]);

        $lagdos = Supplier::query()->where('code', 'lagdos')->first();
        if ($lagdos === null) {
            $lagdosNameConflict = Supplier::query()->where('name', 'Lagdos')->first();
            if ($lagdosNameConflict !== null) {
                $lagdosNameConflict->update([
                    'code' => 'lagdos',
                    'is_active' => true,
                ]);
            } else {
                Supplier::query()->create([
                    'code' => 'lagdos',
                    'name' => 'Lagdos',
                    'is_active' => true,
                ]);
            }
        }
    }

    public function down(): void
    {
        $edp = Supplier::query()->where('code', 'edp')->first();
        if ($edp !== null) {
            $nameConflict = Supplier::query()
                ->where('name', 'Supplier XLS Price')
                ->where('id', '!=', $edp->id)
                ->first();
            if ($nameConflict !== null) {
                $nameConflict->update([
                    'name' => $this->uniqueSupplierName((string) $nameConflict->name, (int) $nameConflict->id),
                ]);
            }

            $codeConflict = Supplier::query()
                ->where('code', 'supplier-price-xls')
                ->where('id', '!=', $edp->id)
                ->first();
            if ($codeConflict !== null) {
                $codeConflict->update([
                    'code' => $this->uniqueSupplierCode('supplier-price-xls', (int) $codeConflict->id),
                ]);
            }

            $edp->update([
                'code' => 'supplier-price-xls',
                'name' => 'Supplier XLS Price',
            ]);
        }

        $lagdos = Supplier::query()->where('code', 'lagdos')->first();
        if ($lagdos === null) {
            return;
        }

        $hasProducts = DB::table('supplier_products')->where('supplier_id', $lagdos->id)->exists();
        $hasRules = DB::table('seller_one_match_rules')->where('supplier_id', $lagdos->id)->exists();
        if (! $hasProducts && ! $hasRules) {
            $lagdos->delete();
        }
    }

    private function uniqueSupplierName(string $base, int $id): string
    {
        $candidate = mb_substr(trim($base) !== '' ? trim($base) : 'Supplier', 0, 200).' #'.$id;
        $n = 0;
        while (Supplier::query()->where('name', $candidate)->where('id', '!=', $id)->exists()) {
            $n++;
            $candidate = mb_substr(trim($base) !== '' ? trim($base) : 'Supplier', 0, 190).' #'.$id.'-'.$n;
        }

        return $candidate;
    }

    private function uniqueSupplierCode(string $base, int $id): string
    {
        $candidate = $base.'-legacy-'.$id;
        $n = 0;
        while (Supplier::query()->where('code', $candidate)->where('id', '!=', $id)->exists()) {
            $n++;
            $candidate = $base.'-legacy-'.$id.'-'.$n;
        }

        return $candidate;
    }
};

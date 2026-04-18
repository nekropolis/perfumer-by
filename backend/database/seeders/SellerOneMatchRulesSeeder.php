<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Catalog\Models\SellerOneMatchRule;
use Modules\Catalog\Models\Supplier;

class SellerOneMatchRulesSeeder extends Seeder
{
    private const SELLER_ONE_SUPPLIER_CODE = 'supplier-price-xls';

    private const SELLER_ONE_SUPPLIER_NAME = 'Supplier XLS Price';

    private const RULES = [
        [
            'pattern' => 'A.Banderas',
            'replacement' => 'Antonio Banderas',
            'sort_order' => 10,
        ],
    ];

    public function run(): void
    {
        $supplier = Supplier::query()->firstOrCreate(
            ['code' => self::SELLER_ONE_SUPPLIER_CODE],
            [
                'name' => self::SELLER_ONE_SUPPLIER_NAME,
                'is_active' => true,
            ]
        );

        foreach (self::RULES as $rule) {
            SellerOneMatchRule::query()->updateOrCreate(
                [
                    'supplier_id' => $supplier->id,
                    'pattern' => $rule['pattern'],
                ],
                [
                    'replacement' => $rule['replacement'],
                    'sort_order' => $rule['sort_order'],
                    'is_active' => true,
                ]
            );
        }
    }
}

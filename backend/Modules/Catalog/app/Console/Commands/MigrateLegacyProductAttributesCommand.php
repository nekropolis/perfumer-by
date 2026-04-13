<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Attribute;
use Modules\Catalog\Models\AttributeOption;
use Modules\Catalog\Models\ProductAttribute;
use Modules\Catalog\Models\ProductAttributeValue;
use Modules\Catalog\Models\ProductAttributeValueOption;

class MigrateLegacyProductAttributesCommand extends Command
{
    protected $signature = 'catalog:migrate-legacy-product-attributes';
    protected $description = 'Migrate legacy product_attributes into attributes, attribute_options, product_attribute_values and product_attribute_value_options';

    public function handle(): int
    {
        $this->info('Starting legacy product attributes migration...');

        DB::beginTransaction();

        try {
            $rows = ProductAttribute::query()
                ->orderBy('id')
                ->get();

            if ($rows->isEmpty()) {
                $this->warn('Legacy product_attributes table is empty.');
                DB::commit();

                return self::SUCCESS;
            }

            $groupedByName = $rows->groupBy(function ($row) {
                return trim((string) $row->name);
            });

            $attributeMap = [];
            $optionMap = [];

            foreach ($groupedByName as $name => $items) {
                if ($name === '') {
                    continue;
                }

                $isMultiselect = $items->contains(function ($item) {
                    return str_contains((string) $item->value, ',');
                });

                $attribute = Attribute::query()->create([
                    'name' => $name,
                    'type' => $isMultiselect ? 'multiselect' : 'select',
                    'sort_order' => 0,
                    'is_active' => true,
                ]);

                $attributeMap[$name] = $attribute;

                $uniqueOptions = [];

                foreach ($items as $item) {
                    $parts = $this->splitValue((string) $item->value);

                    foreach ($parts as $part) {
                        $normalized = $this->normalizeOptionName($part);

                        if ($normalized === '') {
                            continue;
                        }

                        $uniqueOptions[$normalized] = true;
                    }
                }

                $sortOrder = 0;

                foreach (array_keys($uniqueOptions) as $optionName) {
                    $option = AttributeOption::query()->create([
                        'attribute_id' => $attribute->id,
                        'name' => $optionName,
                        'sort_order' => $sortOrder++,
                        'is_active' => true,
                    ]);

                    $optionMap[$attribute->id][$optionName] = $option;
                }
            }

            $createdProductValues = 0;
            $createdSelections = 0;

            foreach ($rows as $row) {
                $attributeName = trim((string) $row->name);

                if ($attributeName === '' || !isset($attributeMap[$attributeName])) {
                    continue;
                }

                $attribute = $attributeMap[$attributeName];
                $productValue = ProductAttributeValue::query()->firstOrCreate(
                    [
                        'product_id' => $row->product_id,
                        'attribute_id' => $attribute->id,
                    ],
                    [
                        'custom_value' => null,
                        'sort_order' => $row->sort_order ?? 0,
                    ]
                );

                if ($productValue->wasRecentlyCreated) {
                    $createdProductValues++;
                }

                $parts = $this->splitValue((string) $row->value);

                foreach ($parts as $part) {
                    $normalized = $this->normalizeOptionName($part);

                    if ($normalized === '') {
                        continue;
                    }

                    $option = $optionMap[$attribute->id][$normalized] ?? null;

                    if (!$option) {
                        continue;
                    }

                    $selection = ProductAttributeValueOption::query()->firstOrCreate([
                        'product_attribute_value_id' => $productValue->id,
                        'attribute_option_id' => $option->id,
                    ]);

                    if ($selection->wasRecentlyCreated) {
                        $createdSelections++;
                    }
                }
            }

            DB::commit();

            $this->info('Migration completed successfully.');
            $this->line('Created attributes: ' . count($attributeMap));
            $this->line('Created product attribute values: ' . $createdProductValues);
            $this->line('Created selected options: ' . $createdSelections);

            return self::SUCCESS;
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error('Migration failed: ' . $e->getMessage());

            return self::FAILURE;
        }
    }

    /**
     * @return array<int, string>
     */
    private function splitValue(string $value): array
    {
        $value = trim($value);

        if ($value === '') {
            return [];
        }

        return array_values(array_filter(array_map(
            fn ($part) => trim($part),
            explode(',', $value)
        ), fn ($part) => $part !== ''));
    }

    private function normalizeOptionName(string $value): string
    {
        $value = trim($value);
        $value = preg_replace('/\s+/u', ' ', $value) ?? $value;

        return $value;
    }
}

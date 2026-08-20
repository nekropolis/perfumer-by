<?php

namespace Modules\Catalog\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductSet;
use Modules\Catalog\Models\ProductSetComponent;
use Modules\Catalog\Models\ProductVariantLink;
use Modules\Catalog\Models\VariantDefinition;
use Modules\Catalog\Support\VariantDefinitionResolver;
use Modules\Catalog\Support\VariantDefinitionVolume;
use Modules\Warehouse\Services\StockInventoryService;

class ProductSetAdminController extends Controller
{
    public function index(int $productId): JsonResponse
    {
        $product = Product::query()->findOrFail($productId);
        $sets = $product->sets()
            ->with(['components', 'variantLink.definition'])
            ->get()
            ->map(fn (ProductSet $set) => $this->serializeSet($set))
            ->values();

        return response()->json(['data' => $sets]);
    }

    public function store(Request $request, int $productId): JsonResponse
    {
        $product = Product::query()->findOrFail($productId);

        $validated = $request->validate([
            'variant_definition_id' => ['required', 'integer', 'exists:variant_definitions,id'],
            'title' => ['nullable', 'string', 'max:255'],
        ]);

        $definition = VariantDefinition::query()
            ->where('is_set', true)
            ->find($validated['variant_definition_id']);
        if (! $definition) {
            return response()->json(['message' => 'Выберите набор из справочника вариантов'], 422);
        }

        $alreadyLinked = ProductVariantLink::query()
            ->where('product_id', $product->id)
            ->where('variant_definition_id', $definition->id)
            ->exists();
        if ($alreadyLinked) {
            return response()->json(['message' => 'Этот набор уже добавлен к товару'], 422);
        }

        $components = VariantDefinitionResolver::componentsFromSetLabels(
            $definition->volume_label,
            $definition->concentration_label,
        );
        if ($components === []) {
            return response()->json(['message' => 'У выбранного набора нет состава'], 422);
        }

        $set = DB::transaction(function () use ($product, $definition, $components, $validated): ProductSet {
            $set = $this->attachSetDefinition($product, $definition, $components, $validated['title'] ?? null);
            $this->syncProductIsSetFlag($product);

            return $set;
        });

        app(StockInventoryService::class)->syncProductStockFlagsByProductId((int) $product->id);

        return response()->json([
            'message' => 'Набор добавлен',
            'data' => $this->serializeSet($set->load(['components', 'variantLink.definition'])),
        ], 201);
    }

    public function update(Request $request, int $productId, int $setId): JsonResponse
    {
        $product = Product::query()->findOrFail($productId);
        $set = ProductSet::query()
            ->where('product_id', $product->id)
            ->with(['components', 'variantLink.definition'])
            ->findOrFail($setId);

        $validated = $request->validate([
            'variant_definition_ids' => ['nullable', 'array', 'min:1'],
            'variant_definition_ids.*' => ['integer', 'exists:variant_definitions,id'],
            'set_components' => ['nullable', 'array', 'min:1'],
            'set_components.*.volume_label' => ['required_with:set_components', 'string', 'max:80'],
            'set_components.*.concentration_label' => ['required_with:set_components', 'string', 'max:120'],
            'set_components.*.sort_order' => ['nullable', 'integer', 'min:0'],
            'title' => ['nullable', 'string', 'max:255'],
        ]);

        $components = null;
        if (array_key_exists('variant_definition_ids', $validated) && is_array($validated['variant_definition_ids'])) {
            $components = $this->componentsFromDefinitionIds($validated['variant_definition_ids']);
        } elseif (array_key_exists('set_components', $validated) && is_array($validated['set_components'])) {
            $components = [];
            foreach (array_values($validated['set_components']) as $index => $row) {
                $volumeLabel = trim((string) ($row['volume_label'] ?? ''));
                $concentrationLabel = trim((string) ($row['concentration_label'] ?? ''));
                if ($volumeLabel === '' || $concentrationLabel === '') {
                    continue;
                }
                $components[] = [
                    'volume_label' => $volumeLabel,
                    'concentration_label' => $concentrationLabel,
                    'sort_order' => (int) ($row['sort_order'] ?? $index),
                ];
            }
        }

        if ($components !== null && $components === []) {
            return response()->json(['message' => 'Состав набора не может быть пустым'], 422);
        }

        DB::transaction(function () use ($set, $components, $validated): void {
            if ($components !== null) {
                $this->replaceSetComponents($set, $components);
                $this->resyncSetSku($set, $components);
            }

            if (array_key_exists('title', $validated)) {
                $title = trim((string) ($validated['title'] ?? ''));
                $set->update(['title' => $title !== '' ? $title : $set->title]);
            }
        });

        app(StockInventoryService::class)->syncProductStockFlagsByProductId((int) $product->id);

        return response()->json([
            'message' => 'Набор обновлён',
            'data' => $this->serializeSet($set->fresh()->load(['components', 'variantLink.definition'])),
        ]);
    }

    public function destroy(int $productId, int $setId): JsonResponse
    {
        $product = Product::query()->findOrFail($productId);
        $set = ProductSet::query()
            ->where('product_id', $product->id)
            ->findOrFail($setId);

        DB::transaction(function () use ($product, $set): void {
            $linkId = $set->product_variant_link_id;
            $set->delete();

            if ($linkId) {
                ProductVariantLink::query()
                    ->where('id', $linkId)
                    ->where('product_id', $product->id)
                    ->delete();
            }

            $this->syncProductIsSetFlag($product);
        });

        app(StockInventoryService::class)->syncProductStockFlagsByProductId((int) $product->id);

        return response()->json([
            'message' => 'Набор удалён',
        ]);
    }

    /**
     * @param  list<int>  $definitionIds
     * @return list<array{volume_label: string, concentration_label: string, sort_order: int}>
     */
    private function componentsFromDefinitionIds(array $definitionIds): array
    {
        $ids = array_values(array_map(static fn ($id): int => (int) $id, $definitionIds));
        $definitions = VariantDefinition::query()
            ->whereIn('id', $ids)
            ->where('is_set', false)
            ->get()
            ->keyBy('id');

        $components = [];
        foreach ($ids as $index => $definitionId) {
            $definition = $definitions->get($definitionId);
            if (! $definition) {
                continue;
            }

            $volumeLabel = $definition->volume_ml !== null
                ? VariantDefinitionVolume::formatForTitle((float) $definition->volume_ml)
                : trim((string) ($definition->volume_label ?? ''));
            $concentrationLabel = trim((string) ($definition->concentration_label ?: $definition->concentration_code));
            if ($volumeLabel === '' || $concentrationLabel === '') {
                continue;
            }

            if ((bool) $definition->is_tester) {
                $concentrationLabel .= ' / Тестер';
            }
            if ((bool) $definition->is_vial) {
                $concentrationLabel .= ' / Пробник';
            }
            if ((bool) $definition->is_miniature) {
                $concentrationLabel .= ' / Миниатюра';
            }

            $components[] = [
                'volume_label' => $volumeLabel,
                'concentration_label' => $concentrationLabel,
                'sort_order' => $index,
            ];
        }

        return $components;
    }

    /**
     * @param  list<array{volume_label: string, concentration_label: string, sort_order?: int}>  $components
     */
    private function attachSetDefinition(
        Product $product,
        VariantDefinition $definition,
        array $components,
        ?string $title,
    ): ProductSet {
        $maxSort = (int) ProductVariantLink::query()->where('product_id', $product->id)->max('sort_order');
        $link = ProductVariantLink::query()->create([
            'product_id' => $product->id,
            'variant_definition_id' => $definition->id,
            'price' => 0,
            'stock' => 0,
            'is_preorder' => false,
            'is_active' => true,
            'is_promotion' => false,
            'sort_order' => $maxSort + 1,
        ]);

        $setSort = (int) ProductSet::query()->where('product_id', $product->id)->max('sort_order');
        $resolvedTitle = trim((string) ($title ?? ''));
        if ($resolvedTitle === '') {
            $resolvedTitle = $definition->displayTitle();
        }

        $set = ProductSet::query()->create([
            'product_id' => $product->id,
            'product_variant_link_id' => $link->id,
            'title' => $resolvedTitle,
            'sort_order' => $setSort + 1,
        ]);

        $this->replaceSetComponents($set, $components);

        return $set;
    }

    /**
     * @param  list<array{volume_label: string, concentration_label: string, sort_order?: int}>  $components
     */
    private function replaceSetComponents(ProductSet $set, array $components): void
    {
        ProductSetComponent::query()->where('product_set_id', $set->id)->delete();

        $rows = [];
        foreach (array_values($components) as $index => $component) {
            $rows[] = [
                'product_set_id' => $set->id,
                'volume_label' => $component['volume_label'],
                'concentration_label' => $component['concentration_label'],
                'sort_order' => (int) ($component['sort_order'] ?? $index),
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }

        if ($rows !== []) {
            ProductSetComponent::query()->insert($rows);
        }
    }

    /**
     * @param  list<array{volume_label: string, concentration_label: string, sort_order?: int}>  $components
     */
    private function resyncSetSku(ProductSet $set, array $components): void
    {
        $volumeLabel = implode('/', array_map(static fn (array $row): string => $row['volume_label'], $components));
        $concentrationLabel = implode('/', array_map(static fn (array $row): string => $row['concentration_label'], $components));
        $definition = app(VariantDefinitionResolver::class)->resolveOrCreateSet($volumeLabel, $concentrationLabel);

        $link = $set->variantLink;
        if ($link) {
            $link->update(['variant_definition_id' => $definition->id]);
        } else {
            $maxSort = (int) ProductVariantLink::query()->where('product_id', $set->product_id)->max('sort_order');
            $link = ProductVariantLink::query()->create([
                'product_id' => $set->product_id,
                'variant_definition_id' => $definition->id,
                'price' => 0,
                'stock' => 0,
                'is_preorder' => false,
                'is_active' => false,
                'is_promotion' => false,
                'sort_order' => $maxSort + 1,
            ]);
            $set->update(['product_variant_link_id' => $link->id]);
        }

        $set->update([
            'title' => $set->title ?: ('Набор ('.$volumeLabel.')'),
        ]);
    }

    private function syncProductIsSetFlag(Product $product): void
    {
        $hasSets = ProductSet::query()->where('product_id', $product->id)->exists();
        $product->update(['is_set' => $hasSets]);
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeSet(ProductSet $set): array
    {
        return [
            'id' => $set->id,
            'product_id' => $set->product_id,
            'product_variant_link_id' => $set->product_variant_link_id,
            'title' => $set->title,
            'sort_order' => (int) $set->sort_order,
            'variant' => $set->variantLink ? [
                'id' => $set->variantLink->id,
                'display_name' => $set->variantLink->display_name,
                'price' => $set->variantLink->price,
                'is_active' => (bool) $set->variantLink->is_active,
            ] : null,
            'components' => $set->components->map(static fn (ProductSetComponent $row) => [
                'id' => $row->id,
                'volume_label' => $row->volume_label,
                'concentration_label' => $row->concentration_label,
                'sort_order' => (int) $row->sort_order,
            ])->values()->all(),
        ];
    }
}

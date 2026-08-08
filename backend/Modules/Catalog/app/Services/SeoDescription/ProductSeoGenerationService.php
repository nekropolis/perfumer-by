<?php

namespace Modules\Catalog\Services\SeoDescription;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Modules\Catalog\Jobs\DispatchProductSeoGeneration;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductSeoGeneration;

class ProductSeoGenerationService
{
    public function __construct(
        private readonly ProductSeoPayloadBuilder $payloadBuilder,
        private readonly ProductSeoResultValidator $resultValidator,
    ) {}

    /**
     * @return array<string, array{state: 'new'|'generated'|'manually_changed', current: string|null}>
     */
    public function preview(Product $product): array
    {
        $lastGenerated = $this->lastGeneratedValues($product);
        $states = [];

        foreach (ProductSeoPayloadBuilder::FIELDS as $field) {
            $value = $product->getAttribute($field);
            $current = $value === null ? null : (string) $value;
            if (! array_key_exists($field, $lastGenerated)) {
                $state = trim((string) $current) === '' ? 'new' : 'manually_changed';
            } else {
                $state = $current === $lastGenerated[$field] ? 'generated' : 'manually_changed';
            }

            $states[$field] = ['state' => $state, 'current' => $current];
        }

        return $states;
    }

    /**
     * @param  list<string>  $requestedFields
     */
    public function start(Product $product, array $requestedFields, bool $confirmManualChanges): ProductSeoGeneration
    {
        $requestedFields = array_values(array_unique($requestedFields));
        if ($requestedFields === [] || array_diff($requestedFields, ProductSeoPayloadBuilder::FIELDS) !== []) {
            throw ValidationException::withMessages(['fields' => 'Выберите хотя бы одно допустимое поле.']);
        }

        return DB::transaction(function () use ($product, $requestedFields, $confirmManualChanges): ProductSeoGeneration {
            $lockedProduct = Product::query()->lockForUpdate()->findOrFail($product->id);
            $active = ProductSeoGeneration::query()
                ->where('product_id', $lockedProduct->id)
                ->whereIn('status', ProductSeoGeneration::ACTIVE_STATUSES)
                ->first();
            if ($active !== null) {
                return $active;
            }

            $states = $this->preview($lockedProduct);
            foreach ($requestedFields as $field) {
                if ($states[$field]['state'] === 'generated') {
                    throw ValidationException::withMessages([
                        'fields.'.$field => 'Поле уже уникализировано и не изменялось.',
                    ]);
                }
                if ($states[$field]['state'] === 'manually_changed' && ! $confirmManualChanges) {
                    throw ValidationException::withMessages([
                        'confirm_manual_changes' => 'Подтвердите перезапись полей с ручными изменениями.',
                    ]);
                }
            }

            $snapshot = $this->payloadBuilder->build($lockedProduct, $requestedFields);
            $generation = ProductSeoGeneration::query()->create([
                'product_id' => $lockedProduct->id,
                'active_product_id' => $lockedProduct->id,
                'status' => ProductSeoGeneration::STATUS_PENDING,
                'requested_fields' => $requestedFields,
                'source_snapshot' => $snapshot,
                'source_hash' => $this->payloadBuilder->hash($snapshot),
                'attempts' => 0,
                'deadline_at' => now()->addSeconds(max(30, (int) config('seo_description.deadline', 600))),
            ]);

            DB::afterCommit(static fn () => DispatchProductSeoGeneration::dispatch($generation->id));

            return $generation;
        });
    }

    /**
     * @param  array<string, mixed>  $result
     */
    public function applyCompleted(int $generationId, array $result): ProductSeoGeneration
    {
        return DB::transaction(function () use ($generationId, $result): ProductSeoGeneration {
            $generation = ProductSeoGeneration::query()->lockForUpdate()->findOrFail($generationId);
            if ($generation->isTerminal()) {
                return $generation;
            }

            $product = Product::query()->lockForUpdate()->findOrFail($generation->product_id);
            $requestedFields = array_values(array_map('strval', $generation->requested_fields ?? []));
            $validated = $this->resultValidator->validate($requestedFields, $result);
            $currentSnapshot = $this->payloadBuilder->build($product, $requestedFields);

            if (! hash_equals($generation->source_hash, $this->payloadBuilder->hash($currentSnapshot))) {
                $generation->update([
                    'status' => ProductSeoGeneration::STATUS_CONFLICTED,
                    'external_status' => 'completed',
                    'result' => $validated,
                    'error' => 'Товар был изменён после запуска генерации.',
                    'active_product_id' => null,
                    'finished_at' => now(),
                ]);

                return $generation->fresh();
            }

            $updates = $validated;
            if (array_key_exists('description', $validated)) {
                $updates['description_rewritten_at'] = now();
            }
            $product->update($updates);

            $generation->update([
                'status' => ProductSeoGeneration::STATUS_COMPLETED,
                'external_status' => 'completed',
                'result' => $validated,
                'error' => null,
                'active_product_id' => null,
                'finished_at' => now(),
            ]);

            return $generation->fresh();
        });
    }

    public function fail(int $generationId, string $error, ?string $externalStatus = null): void
    {
        DB::transaction(function () use ($generationId, $error, $externalStatus): void {
            $generation = ProductSeoGeneration::query()->lockForUpdate()->find($generationId);
            if ($generation === null || $generation->isTerminal()) {
                return;
            }

            $generation->update([
                'status' => ProductSeoGeneration::STATUS_FAILED,
                'external_status' => $externalStatus ?? $generation->external_status,
                'error' => mb_substr($error, 0, 2000),
                'active_product_id' => null,
                'finished_at' => now(),
            ]);
        });
    }

    /**
     * @return array<string, string>
     */
    private function lastGeneratedValues(Product $product): array
    {
        $values = [];
        $generations = ProductSeoGeneration::query()
            ->where('product_id', $product->id)
            ->where('status', ProductSeoGeneration::STATUS_COMPLETED)
            ->latest('id')
            ->get(['requested_fields', 'result']);

        foreach ($generations as $generation) {
            $result = is_array($generation->result) ? $generation->result : [];
            foreach ((array) $generation->requested_fields as $field) {
                if (
                    is_string($field)
                    && ! array_key_exists($field, $values)
                    && isset($result[$field])
                    && is_string($result[$field])
                ) {
                    $values[$field] = $result[$field];
                }
            }
            if (count($values) === count(ProductSeoPayloadBuilder::FIELDS)) {
                break;
            }
        }

        return $values;
    }
}

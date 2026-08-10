<?php

namespace Modules\Catalog\Services\SeoDescription;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\ProductSeoBatch;
use Modules\Catalog\Models\ProductSeoBatchItem;
use Modules\Catalog\Models\ProductSeoFieldReceipt;

class ProductSeoWorkQueueService
{
    public function __construct(
        private readonly SeoDescriptionClient $client,
        private readonly ProductSeoPayloadBuilder $payloadBuilder,
        private readonly ProductSeoResultValidator $resultValidator,
    ) {}

    /**
     * @return array{
     *     eligible_products: int,
     *     missing_fields: array<string, int>,
     *     receipts_complete: int,
     *     remote: array{
     *         pending: int,
     *         queued: int,
     *         processing: int,
     *         in_flight: int,
     *         completed: int,
     *         failed: int,
     *         skipped: int,
     *         undelivered: int,
     *         daily_used: int,
     *         daily_limit: int
     *     }|null,
     *     remote_error: string|null
     * }
     */
    public function overview(): array
    {
        $missing = [];
        foreach (ProductSeoPayloadBuilder::FIELDS as $field) {
            $missing[$field] = $this->eligibleQuery(false, [$field])->count();
        }

        $remote = null;
        $remoteError = null;
        try {
            $remote = $this->normalizeRemoteStats($this->client->stats());
        } catch (SeoDescriptionException $e) {
            $remoteError = $e->getMessage();
        }

        return [
            'eligible_products' => $this->eligibleQuery()->count(),
            'missing_fields' => $missing,
            'receipts_complete' => $this->completeReceiptsCount(),
            'remote' => $remote,
            'remote_error' => $remoteError,
        ];
    }

    public function submitChunk(?int $limit = null, bool $force = false): ProductSeoBatch
    {
        $chunkSize = max(1, min(
            $limit ?? (int) config('seo_description.work_chunk_size', 500),
            500,
        ));

        $products = $this->eligibleQuery($force)
            ->with([
                'brand',
                'attributeValues.productAttribute',
                'attributeValues.selectedOptions.productAttributeOption',
                'seoFieldReceipts',
            ])
            ->orderBy('id')
            ->limit($chunkSize)
            ->get();

        if ($products->isEmpty()) {
            throw new SeoDescriptionException('Нет товаров для отправки в SEO API.');
        }

        $payloadProducts = [];
        $itemRows = [];
        foreach ($products as $product) {
            $fields = $this->fieldsForProduct($product, $force);
            if ($fields === []) {
                continue;
            }

            $built = $this->payloadBuilder->build($product, array_keys($fields));
            $payloadProducts[] = [
                'external_id' => (string) $product->id,
                'product_name' => $built['product_name'],
                'brand' => $built['brand'],
                'specs' => $built['specs'],
                'fields' => $fields,
            ];
            $itemRows[] = [
                'product_id' => (int) $product->id,
                'external_id' => (string) $product->id,
                'requested_fields' => array_keys($fields),
            ];
        }

        if ($payloadProducts === []) {
            throw new SeoDescriptionException('Нет полей для отправки в SEO API.');
        }

        $batch = ProductSeoBatch::query()->create([
            'status' => ProductSeoBatch::STATUS_PENDING,
            'requested_count' => count($payloadProducts),
            'force' => $force,
        ]);

        foreach ($itemRows as $row) {
            ProductSeoBatchItem::query()->create([
                'product_seo_batch_id' => $batch->id,
                'product_id' => $row['product_id'],
                'external_id' => $row['external_id'],
                'requested_fields' => $row['requested_fields'],
                'status' => ProductSeoBatchItem::STATUS_SUBMITTED,
            ]);
        }

        try {
            $response = $this->client->submitWork($payloadProducts, $force);
        } catch (SeoDescriptionException $e) {
            $batch->update([
                'status' => ProductSeoBatch::STATUS_FAILED,
                'error' => mb_substr($e->getMessage(), 0, 2000),
                'finished_at' => now(),
            ]);

            throw $e;
        }

        $batch->update([
            'external_batch_id' => $response['batch_id'],
            'status' => ProductSeoBatch::STATUS_SUBMITTED,
            'accepted_count' => $response['accepted'],
            'queued_count' => $response['queued'],
            'response' => $response['raw'],
            'submitted_at' => now(),
            'error' => null,
        ]);

        return $batch->fresh('items') ?? $batch;
    }

    /**
     * @return array{
     *     fetched: int,
     *     applied: int,
     *     failed: int,
     *     skipped: int,
     *     acked: int
     * }
     */
    public function pullAndApplyReady(?int $limit = null): array
    {
        $readyLimit = max(1, min(
            $limit ?? (int) config('seo_description.ready_limit', 100),
            500,
        ));
        $ready = $this->client->fetchReady($readyLimit);

        $applied = 0;
        $failed = 0;
        $skipped = 0;
        $ackIds = [];

        foreach ($ready as $row) {
            $externalId = $row['external_id'];
            $productId = (int) $externalId;
            if ($productId <= 0 || (string) $productId !== $externalId) {
                $skipped++;

                continue;
            }

            $product = Product::query()->find($productId);
            $item = ProductSeoBatchItem::query()
                ->where('external_id', $externalId)
                ->whereIn('status', [
                    ProductSeoBatchItem::STATUS_SUBMITTED,
                    ProductSeoBatchItem::STATUS_FAILED,
                ])
                ->latest('id')
                ->first();

            if ($product === null) {
                if ($item !== null) {
                    $wasFailed = $item->status === ProductSeoBatchItem::STATUS_FAILED;
                    $item->update([
                        'status' => ProductSeoBatchItem::STATUS_SKIPPED,
                        'result' => $row['result'],
                        'error' => 'Товар не найден.',
                    ]);
                    if ($wasFailed) {
                        $this->bumpBatchCounters((int) $item->product_seo_batch_id, failed: -1);
                    }
                }
                $ackIds[] = $externalId;
                $skipped++;

                continue;
            }

            try {
                $validated = $this->resultValidator->validateAvailable($row['result']);
                $requested = is_array($item?->requested_fields) ? $item->requested_fields : null;
                if ($requested !== null) {
                    $validated = array_intersect_key($validated, array_flip($requested));
                }
                if ($this->isLegacyProductId((int) $product->id)) {
                    $validated = $this->onlyEmptyFields($product, $validated);
                }
                if ($validated === []) {
                    throw new SeoDescriptionException('SEO API result has no applicable fields.');
                }
                $this->applyResult($product, $validated, $item);
                if ($item !== null) {
                    $wasFailed = $item->status === ProductSeoBatchItem::STATUS_FAILED;
                    $item->update([
                        'status' => ProductSeoBatchItem::STATUS_APPLIED,
                        'result' => $row['result'],
                        'applied_fields' => array_keys($validated),
                        'error' => null,
                    ]);
                    $this->bumpBatchCounters(
                        (int) $item->product_seo_batch_id,
                        applied: 1,
                        failed: $wasFailed ? -1 : 0,
                    );
                }
                $ackIds[] = $externalId;
                $applied++;
            } catch (SeoDescriptionException $e) {
                if ($item !== null) {
                    $wasFailed = $item->status === ProductSeoBatchItem::STATUS_FAILED;
                    $item->update([
                        'status' => ProductSeoBatchItem::STATUS_FAILED,
                        'result' => $row['result'],
                        'error' => mb_substr($e->getMessage(), 0, 2000),
                    ]);
                    if (! $wasFailed) {
                        $this->bumpBatchCounters((int) $item->product_seo_batch_id, failed: 1);
                    }
                }
                $failed++;
            }
        }

        $acked = 0;
        if ($ackIds !== []) {
            $this->client->acknowledge($ackIds);
            $acked = count($ackIds);
        }

        return [
            'fetched' => count($ready),
            'applied' => $applied,
            'failed' => $failed,
            'skipped' => $skipped,
            'acked' => $acked,
        ];
    }

    /**
     * @param  list<string>|null  $onlyFields
     */
    public function eligibleQuery(bool $force = false, ?array $onlyFields = null): Builder
    {
        $fields = $onlyFields ?? ProductSeoPayloadBuilder::FIELDS;

        return Product::query()
            ->where($this->notInFlight())
            ->where(function (Builder $root) use ($fields, $force): void {
            $root->where(function (Builder $nonLegacy) use ($fields, $force): void {
                $nonLegacy->where($this->notLegacy());
                if ($force) {
                    return;
                }

                $nonLegacy->where(function (Builder $outer) use ($fields): void {
                    foreach ($fields as $field) {
                        $outer->orWhere(function (Builder $inner) use ($field): void {
                            $inner->where(function (Builder $valueQuery) use ($field): void {
                                $valueQuery->whereNull($field)->orWhere($field, '');
                            })->orWhereNotExists(function ($receipt) use ($field): void {
                                $receipt->select(DB::raw(1))
                                    ->from('product_seo_field_receipts')
                                    ->whereColumn('product_seo_field_receipts.product_id', 'products.id')
                                    ->where('product_seo_field_receipts.field', $field);
                            });
                        });
                    }
                });
            })->orWhere(function (Builder $legacy) use ($fields): void {
                // Legacy: только пустые поля (заполненные из legacy не перезаписываем).
                $legacy->where($this->isLegacy())
                    ->where(function (Builder $outer) use ($fields): void {
                        foreach ($fields as $field) {
                            $outer->orWhere(function (Builder $inner) use ($field): void {
                                $inner->whereNull($field)->orWhere($field, '');
                            });
                        }
                    });
            });
        });
    }

    /**
     * Товары уже отправленные и ещё не применённые не уходят повторно.
     *
     * @return \Closure(Builder): void
     */
    private function notInFlight(): \Closure
    {
        return static function (Builder $query): void {
            $query->whereNotExists(function ($inFlight) {
                $inFlight->select(DB::raw(1))
                    ->from('product_seo_batch_items')
                    ->whereColumn('product_seo_batch_items.product_id', 'products.id')
                    ->where('product_seo_batch_items.status', ProductSeoBatchItem::STATUS_SUBMITTED);
            });
        };
    }

    /**
     * @return \Closure(Builder): void
     */
    private function notLegacy(): \Closure
    {
        return static function (Builder $query): void {
            $query->whereNotExists(function ($legacy) {
                $legacy->select(DB::raw(1))
                    ->from('legacy_map_products')
                    ->where('legacy_map_products.status', 'matched')
                    ->whereNotNull('legacy_map_products.product_id')
                    ->whereColumn('legacy_map_products.product_id', 'products.id');
            })->whereNotExists(function ($legacy) {
                $legacy->select(DB::raw(1))
                    ->from('legacy_unmatched_products')
                    ->where('legacy_unmatched_products.status', 'linked')
                    ->whereNotNull('legacy_unmatched_products.linked_product_id')
                    ->whereColumn('legacy_unmatched_products.linked_product_id', 'products.id');
            });
        };
    }

    /**
     * @return \Closure(Builder): void
     */
    private function isLegacy(): \Closure
    {
        return static function (Builder $query): void {
            $query->where(function (Builder $legacy) {
                $legacy->whereExists(function ($matched) {
                    $matched->select(DB::raw(1))
                        ->from('legacy_map_products')
                        ->where('legacy_map_products.status', 'matched')
                        ->whereNotNull('legacy_map_products.product_id')
                        ->whereColumn('legacy_map_products.product_id', 'products.id');
                })->orWhereExists(function ($linked) {
                    $linked->select(DB::raw(1))
                        ->from('legacy_unmatched_products')
                        ->where('legacy_unmatched_products.status', 'linked')
                        ->whereNotNull('legacy_unmatched_products.linked_product_id')
                        ->whereColumn('legacy_unmatched_products.linked_product_id', 'products.id');
                });
            });
        };
    }

    private function isLegacyProductId(int $productId): bool
    {
        if ($productId <= 0) {
            return false;
        }

        return DB::table('legacy_map_products')
            ->where('status', 'matched')
            ->where('product_id', $productId)
            ->exists()
            || DB::table('legacy_unmatched_products')
                ->where('status', 'linked')
                ->where('linked_product_id', $productId)
                ->exists();
    }

    /**
     * @return array<string, string|null>
     */
    private function fieldsForProduct(Product $product, bool $force): array
    {
        /** @var array<string, ProductSeoFieldReceipt> $receipts */
        $receipts = $product->relationLoaded('seoFieldReceipts')
            ? $product->seoFieldReceipts->keyBy('field')->all()
            : ProductSeoFieldReceipt::query()
                ->where('product_id', $product->id)
                ->get()
                ->keyBy('field')
                ->all();

        $isLegacy = $this->isLegacyProductId((int) $product->id);
        $fields = [];
        foreach (ProductSeoPayloadBuilder::FIELDS as $field) {
            $current = $product->getAttribute($field);
            $currentString = $current === null ? null : (string) $current;
            $isEmpty = $currentString === null || trim($currentString) === '';
            $hasReceipt = array_key_exists($field, $receipts);

            if ($isLegacy) {
                if ($isEmpty) {
                    $fields[$field] = null;
                }

                continue;
            }

            if ($force || $isEmpty || ! $hasReceipt) {
                $fields[$field] = $isEmpty ? null : $currentString;
            }
        }

        return $fields;
    }

    /**
     * @param  array<string, string>  $validated
     * @return array<string, string>
     */
    private function onlyEmptyFields(Product $product, array $validated): array
    {
        $filtered = [];
        foreach ($validated as $field => $value) {
            $current = $product->getAttribute($field);
            $currentString = $current === null ? null : (string) $current;
            if ($currentString === null || trim($currentString) === '') {
                $filtered[$field] = $value;
            }
        }

        return $filtered;
    }

    /**
     * @param  array<string, string>  $validated
     */
    private function applyResult(Product $product, array $validated, ?ProductSeoBatchItem $item): void
    {
        DB::transaction(function () use ($product, $validated, $item): void {
            $locked = Product::query()->lockForUpdate()->findOrFail($product->id);
            $updates = $validated;
            if (array_key_exists('description', $validated)) {
                $updates['description_rewritten_at'] = now();
            }
            $locked->update($updates);

            foreach ($validated as $field => $value) {
                ProductSeoFieldReceipt::query()->updateOrCreate(
                    [
                        'product_id' => $locked->id,
                        'field' => $field,
                    ],
                    [
                        'value_hash' => hash('sha256', $value),
                        'product_seo_batch_item_id' => $item?->id,
                        'received_at' => now(),
                    ],
                );
            }
        });
    }

    private function bumpBatchCounters(int $batchId, int $applied = 0, int $failed = 0): void
    {
        if ($batchId <= 0) {
            return;
        }

        $batch = ProductSeoBatch::query()->find($batchId);
        if ($batch === null) {
            return;
        }

        $batch->update([
            'applied_count' => max(0, (int) $batch->applied_count + $applied),
            'failed_count' => max(0, (int) $batch->failed_count + $failed),
        ]);
    }

    private function completeReceiptsCount(): int
    {
        $fieldCount = count(ProductSeoPayloadBuilder::FIELDS);

        return (int) ProductSeoFieldReceipt::query()
            ->select('product_id')
            ->groupBy('product_id')
            ->havingRaw('COUNT(*) >= ?', [$fieldCount])
            ->get()
            ->count();
    }

    /**
     * @param  array<string, mixed>  $raw
     * @return array{
     *     pending: int,
     *     queued: int,
     *     processing: int,
     *     in_flight: int,
     *     completed: int,
     *     failed: int,
     *     skipped: int,
     *     undelivered: int,
     *     daily_used: int,
     *     daily_limit: int
     * }
     */
    private function normalizeRemoteStats(array $raw): array
    {
        $pending = (int) ($raw['pending'] ?? 0);
        $queued = (int) ($raw['queued'] ?? 0);
        $processing = (int) ($raw['processing'] ?? 0);

        return [
            'pending' => $pending,
            'queued' => $queued,
            'processing' => $processing,
            'in_flight' => $pending + $queued + $processing,
            'completed' => (int) ($raw['completed'] ?? 0),
            'failed' => (int) ($raw['failed'] ?? 0),
            'skipped' => (int) ($raw['skipped'] ?? 0),
            'undelivered' => (int) ($raw['undelivered'] ?? 0),
            'daily_used' => (int) ($raw['daily_used'] ?? 0),
            'daily_limit' => (int) ($raw['daily_limit'] ?? 0),
        ];
    }
}

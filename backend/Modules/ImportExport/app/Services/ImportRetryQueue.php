<?php

namespace Modules\ImportExport\Services;

use App\Services\AuditLogService;
use Illuminate\Support\Facades\DB;
use Modules\ImportExport\Models\ImportRetryItem;

class ImportRetryQueue
{
    public const MAX_ATTEMPTS = 5;

    public function record(string $taskType, int $productId, ?string $error, array $payload = []): void
    {
        $now = now();
        $errorText = $error !== null && $error !== '' ? mb_substr($error, 0, 5000) : 'unknown error';

        DB::transaction(function () use ($taskType, $productId, $errorText, $payload, $now): void {
            $row = ImportRetryItem::query()
                ->where('task_type', $taskType)
                ->where('product_id', $productId)
                ->lockForUpdate()
                ->first();

            if ($row) {
                if ($row->status === ImportRetryItem::STATUS_DISMISSED) {
                    return;
                }
                $attempts = (int) $row->attempts + 1;
                $row->update([
                    'status' => ImportRetryItem::STATUS_PENDING,
                    'attempts' => $attempts,
                    'last_error' => $errorText,
                    'last_attempt_at' => $now,
                    'payload' => array_merge(is_array($row->payload) ? $row->payload : [], $payload),
                ]);
                if ($attempts >= self::MAX_ATTEMPTS) {
                    $this->auditMaxAttempts($taskType, $productId, $attempts, $errorText);
                }
            } else {
                ImportRetryItem::query()->create([
                    'task_type' => $taskType,
                    'product_id' => $productId,
                    'status' => ImportRetryItem::STATUS_PENDING,
                    'attempts' => 1,
                    'last_error' => $errorText,
                    'last_attempt_at' => $now,
                    'payload' => $payload,
                ]);
            }
        });
    }

    public function markResolved(string $taskType, int $productId): void
    {
        ImportRetryItem::query()
            ->where('task_type', $taskType)
            ->where('product_id', $productId)
            ->where('status', ImportRetryItem::STATUS_PENDING)
            ->update([
                'status' => ImportRetryItem::STATUS_RESOLVED,
                'last_error' => null,
                'updated_at' => now(),
            ]);
    }

    /**
     * @return list<int>
     */
    public function pendingProductIds(string $taskType, int $limit, int $offset = 0): array
    {
        return ImportRetryItem::query()
            ->where('task_type', $taskType)
            ->where('status', ImportRetryItem::STATUS_PENDING)
            ->orderBy('id')
            ->offset($offset)
            ->limit($limit)
            ->pluck('product_id')
            ->map(static fn ($id) => (int) $id)
            ->values()
            ->all();
    }

    public function pendingCount(string $taskType): int
    {
        return (int) ImportRetryItem::query()
            ->where('task_type', $taskType)
            ->where('status', ImportRetryItem::STATUS_PENDING)
            ->count();
    }

    public function dismiss(string $taskType, int $productId): void
    {
        ImportRetryItem::query()
            ->where('task_type', $taskType)
            ->where('product_id', $productId)
            ->where('status', ImportRetryItem::STATUS_PENDING)
            ->update([
                'status' => ImportRetryItem::STATUS_DISMISSED,
                'updated_at' => now(),
            ]);
    }

    private function auditMaxAttempts(string $taskType, int $productId, int $attempts, string $errorText): void
    {
        try {
            app(AuditLogService::class)->record(
                AuditLogService::ENTITY_VANILLE_IMPORT,
                $productId,
                AuditLogService::ACTION_FAILED,
                sprintf('import_retry_queue: max attempts (%d) for task=%s product_id=%d', $attempts, $taskType, $productId),
                [
                    'task_type' => $taskType,
                    'product_id' => $productId,
                    'attempts' => $attempts,
                    'error' => mb_substr($errorText, 0, 500),
                ],
            );
        } catch (\Throwable) {
        }
    }
}

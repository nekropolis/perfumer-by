<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Support\Facades\Auth;

class AuditLogService
{
    public const ACTION_SUCCESS = 'success';

    public const ACTION_FAILED = 'failed';

    public const ACTION_ERROR = 'error';

    public const ACTION_INFO = 'info';

    public const ACTION_RUNNING = 'running';

    public const ACTION_CREATED = 'created';

    public const ACTION_UPDATED = 'updated';

    public const ACTION_DELETED = 'deleted';

    public const ENTITY_VANILLE_IMPORT = 'vanille_import';

    public const ENTITY_BRAND_SYNC = 'brand_sync';

    public const ENTITY_STOCK_RECEIPT = 'stock_receipt';

    public const ENTITY_STOCK_WRITEOFF = 'stock_writeoff';

    public const ENTITY_STOCK_RESERVATION = 'stock_reservation';

    public const ENTITY_STOCK_IMPORT = 'stock_import';

    public function record(
        string $entityType,
        ?int $entityId,
        string $action,
        string $summary,
        ?array $context = null,
        ?int $warehouseId = null,
    ): AuditLog {
        return AuditLog::query()->create([
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'warehouse_id' => $warehouseId,
            'action' => $action,
            'summary' => $summary,
            'context' => $context,
            'actor_id' => Auth::id(),
            'ip_address' => request()?->ip(),
            'created_at' => now(),
        ]);
    }
}

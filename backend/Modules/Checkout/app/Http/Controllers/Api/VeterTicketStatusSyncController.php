<?php

namespace Modules\Checkout\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Modules\Checkout\Services\Veter\VeterTicketStatusSyncService;
use Throwable;

class VeterTicketStatusSyncController extends Controller
{
    public function __invoke(
        VeterTicketStatusSyncService $sync,
        AuditLogService $audit,
    ): JsonResponse {
        try {
            $result = $sync->syncAllInDelivery(VeterTicketStatusSyncService::SOURCE_MANUAL);
        } catch (Throwable $e) {
            $audit->record(
                AuditLogService::ENTITY_VETER_TICKET,
                null,
                AuditLogService::ACTION_FAILED,
                'Ветер getStatus: сбой синхронизации — '.$e->getMessage(),
                [
                    'reason' => $e->getMessage(),
                    'source' => VeterTicketStatusSyncService::SOURCE_MANUAL,
                    'stage' => 'controller',
                ],
            );

            return response()->json([
                'message' => $e->getMessage(),
            ], 502);
        }

        $updated = count($result['updated']);
        $failed = count($result['failed']);

        return response()->json([
            'data' => $result,
            'message' => sprintf(
                'Статусы Ветер: обновлено %d из %d, ошибок: %d',
                $updated,
                $result['total'],
                $failed,
            ),
        ]);
    }
}

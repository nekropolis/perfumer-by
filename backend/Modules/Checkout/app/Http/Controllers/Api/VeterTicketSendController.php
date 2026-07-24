<?php

namespace Modules\Checkout\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Checkout\Services\Veter\VeterTicketSendService;
use Throwable;

class VeterTicketSendController extends Controller
{
    public function __invoke(
        Request $request,
        VeterTicketSendService $send,
        AuditLogService $audit,
    ): JsonResponse {
        $validated = $request->validate([
            'order_ids' => ['required', 'array', 'min:1'],
            'order_ids.*' => ['integer', 'min:1'],
        ]);

        try {
            $result = $send->send($validated['order_ids']);
        } catch (Throwable $e) {
            $audit->record(
                AuditLogService::ENTITY_VETER_TICKET,
                null,
                AuditLogService::ACTION_FAILED,
                'Ветер CreateTickets: сбой отправки — '.$e->getMessage(),
                [
                    'order_ids' => $validated['order_ids'],
                    'reason' => $e->getMessage(),
                    'stage' => 'controller',
                ],
            );

            return response()->json([
                'message' => $e->getMessage(),
            ], 502);
        }

        return response()->json([
            'data' => $result,
            'message' => $this->summaryMessage($result),
        ]);
    }

    /**
     * @param  array{sent: list<mixed>, failed: list<mixed>, skipped: list<mixed>, invalid: list<mixed>}  $result
     */
    private function summaryMessage(array $result): string
    {
        return sprintf(
            'Отправлено: %d, ошибок: %d, пропущено: %d, невалидных: %d',
            count($result['sent'] ?? []),
            count($result['failed'] ?? []),
            count($result['skipped'] ?? []),
            count($result['invalid'] ?? []),
        );
    }
}

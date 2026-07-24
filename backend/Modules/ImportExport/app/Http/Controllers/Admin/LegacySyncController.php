<?php

namespace Modules\ImportExport\Http\Controllers\Admin;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Modules\ImportExport\Services\Legacy\LegacyCustomersOrdersSyncService;
use RuntimeException;
use Throwable;

class LegacySyncController extends Controller
{
    public function __invoke(LegacyCustomersOrdersSyncService $sync): JsonResponse
    {
        try {
            @set_time_limit(300);
            $result = $sync->sync();
        } catch (RuntimeException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'Ошибка синхронизации с легаси: '.$e->getMessage(),
            ], 500);
        }

        $customers = $result['customers'];
        $orders = $result['orders'];
        $message = sprintf(
            'Легаси: клиенты +%d (match %d, skip %d), заказы +%d (skip %d, город ok %d / нет %d)',
            (int) ($customers['created'] ?? 0),
            (int) ($customers['matched'] ?? 0),
            (int) ($customers['skipped'] ?? 0),
            (int) ($orders['imported'] ?? 0),
            (int) ($orders['skipped'] ?? 0),
            (int) ($orders['city_matched'] ?? 0),
            (int) ($orders['city_unmatched'] ?? 0),
        );

        return response()->json([
            'message' => $message,
            'data' => $result,
        ]);
    }
}

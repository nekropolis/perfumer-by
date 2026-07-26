<?php

namespace Modules\Checkout\Services\Veter;

use App\Services\AuditLogService;
use Carbon\Carbon;
use Modules\Checkout\Models\Order;
use Throwable;

class VeterTicketStatusSyncService
{
    public const SOURCE_MANUAL = 'manual';

    public const SOURCE_CRON = 'cron';

    public function __construct(
        private readonly VeterTicketApiClient $client,
        private readonly AuditLogService $audit,
    ) {}

    /**
     * @return array{
     *     updated: list<array{order_id: int, shipment_id: string, shipment_status: string|null}>,
     *     failed: list<array{order_id: int, shipment_id: string, reason: string}>,
     *     total: int
     * }
     */
    public function syncAllInDelivery(string $source = self::SOURCE_MANUAL): array
    {
        $orders = Order::query()
            ->where('status', 'in_delivery')
            ->whereNotNull('shipment_id')
            ->where('shipment_id', '!=', '')
            ->orderBy('id')
            ->get(['id', 'shipment_id', 'shipment_status', 'shipment_status_at']);

        $updated = [];
        $failed = [];

        foreach ($orders as $order) {
            $shipmentId = trim((string) $order->shipment_id);
            if ($shipmentId === '') {
                continue;
            }

            try {
                $status = $this->client->getStatus($shipmentId);
                $lastStatus = $status['lastStatus'];
                $statusAt = $this->parseStatusDate($status['lastStatusDate']);

                $order->shipment_status = $lastStatus;
                $order->shipment_status_at = $statusAt;
                $order->save();

                $updated[] = [
                    'order_id' => (int) $order->id,
                    'shipment_id' => $shipmentId,
                    'shipment_status' => $lastStatus,
                ];
            } catch (Throwable $e) {
                $reason = $e->getMessage();
                $failed[] = [
                    'order_id' => (int) $order->id,
                    'shipment_id' => $shipmentId,
                    'reason' => $reason,
                ];

                $this->audit->record(
                    AuditLogService::ENTITY_VETER_TICKET,
                    (int) $order->id,
                    AuditLogService::ACTION_FAILED,
                    'ветерОК getStatus: заказ #'.$order->id.' — '.$reason,
                    [
                        'order_id' => (int) $order->id,
                        'shipment_id' => $shipmentId,
                        'reason' => $reason,
                        'source' => $source,
                        'stage' => 'getStatus',
                    ],
                );
            }
        }

        return [
            'updated' => $updated,
            'failed' => $failed,
            'total' => $orders->count(),
        ];
    }

    private function parseStatusDate(?string $raw): Carbon
    {
        $raw = trim((string) $raw);
        if ($raw === '') {
            return now();
        }

        try {
            return Carbon::createFromFormat('d.m.Y H:i:s', $raw, config('app.timezone', 'Europe/Minsk'));
        } catch (Throwable) {
            try {
                return Carbon::parse($raw, config('app.timezone', 'Europe/Minsk'));
            } catch (Throwable) {
                return now();
            }
        }
    }
}

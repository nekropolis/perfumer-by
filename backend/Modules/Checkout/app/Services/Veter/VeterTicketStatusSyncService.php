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

    /** Заказы с shipment_id, по которым опрашиваем getStatus. */
    public const SYNCABLE_LOCAL_STATUSES = ['assembled', 'in_delivery'];

    public const LOCAL_STATUS_AT_WAREHOUSE = 'in_delivery';

    public function __construct(
        private readonly VeterTicketApiClient $client,
        private readonly AuditLogService $audit,
    ) {}

    /**
     * @return array{
     *     updated: list<array{order_id: int, shipment_id: string, shipment_status: string|null, shipment_date: string|null, status: string}>,
     *     failed: list<array{order_id: int, shipment_id: string, reason: string}>,
     *     total: int
     * }
     */
    public function syncAllInDelivery(string $source = self::SOURCE_MANUAL): array
    {
        $orders = Order::query()
            ->whereIn('status', self::SYNCABLE_LOCAL_STATUSES)
            ->whereNotNull('shipment_id')
            ->where('shipment_id', '!=', '')
            ->orderBy('id')
            ->get([
                'id',
                'status',
                'shipment_id',
                'shipment_status',
                'shipment_status_at',
                'shipment_date',
                'delivery_date',
            ]);

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
                $previousStatus = $order->shipment_status;

                $order->shipment_status = $lastStatus;
                $order->shipment_status_at = $statusAt;

                // «На складе» или, пока локально ещё «Собран», «В пути»:
                // между опросами курьерка успевает уйти со склада в путь.
                if (self::shouldApplyDeliveryHandoff((string) $order->status, $lastStatus, $previousStatus)) {
                    if ((string) $order->status === VeterTicketPreviewService::STATUS_AFTER_SEND) {
                        $order->status = self::LOCAL_STATUS_AT_WAREHOUSE;
                    }
                    if ($order->delivery_date !== null) {
                        $order->shipment_date = $order->delivery_date->copy()->startOfDay();
                    }
                }

                $order->save();

                $updated[] = [
                    'order_id' => (int) $order->id,
                    'shipment_id' => $shipmentId,
                    'shipment_status' => $lastStatus,
                    'shipment_date' => $order->shipment_date?->format('Y-m-d'),
                    'status' => (string) $order->status,
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

    /**
     * Перевод в «В доставке» и подмена даты отправки датой доставки.
     * «На складе» — в момент перехода. «В пути» — только если локально ещё «Собран»,
     * иначе дата сдвигалась бы на каждом опросе уже уехавшего заказа.
     */
    public static function shouldApplyDeliveryHandoff(string $localStatus, ?string $courierStatus, ?string $previousCourierStatus): bool
    {
        $courier = self::normalizeCourierStatus($courierStatus);
        $previous = self::normalizeCourierStatus($previousCourierStatus);

        if ($courier === 'на складе' && $previous !== 'на складе') {
            return true;
        }

        return $localStatus === VeterTicketPreviewService::STATUS_AFTER_SEND
            && $courier === 'в пути';
    }

    private static function normalizeCourierStatus(?string $status): string
    {
        $status = mb_strtolower(trim((string) $status), 'UTF-8');
        $collapsed = preg_replace('/\s+/u', ' ', $status);

        return is_string($collapsed) ? $collapsed : $status;
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

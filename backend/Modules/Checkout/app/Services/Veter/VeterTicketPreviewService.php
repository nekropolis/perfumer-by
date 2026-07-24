<?php

namespace Modules\Checkout\Services\Veter;

use Modules\Checkout\Models\Order;

class VeterTicketPreviewService
{
    /** Статусы, из которых разрешена отправка в Ветер. */
    public const SENDABLE_STATUSES = ['new', 'confirmed', 'processing', 'preorder'];

    public const STATUS_AFTER_SEND = 'in_delivery';

    public function __construct(
        private readonly VeterTicketPayloadBuilder $builder,
    ) {}

    /**
     * @param  list<int>  $orderIds
     * @return array{
     *     tickets: list<array<string, mixed>>,
     *     ready_order_ids: list<int>,
     *     skipped: list<array{order_id: int, reason: string}>,
     *     invalid: list<array{order_id: int, reason: string, missing: list<string>}>
     * }
     */
    public function preview(array $orderIds): array
    {
        $ids = array_values(array_unique(array_filter(
            array_map('intval', $orderIds),
            static fn (int $id): bool => $id > 0,
        )));

        $tickets = [];
        $readyOrderIds = [];
        $skipped = [];
        $invalid = [];

        if ($ids === []) {
            return [
                'tickets' => [],
                'ready_order_ids' => [],
                'skipped' => [],
                'invalid' => [],
            ];
        }

        $orders = Order::query()
            ->with(['items', 'client:id,first_name,last_name,patronymic'])
            ->whereIn('id', $ids)
            ->get()
            ->keyBy('id');

        foreach ($ids as $id) {
            /** @var Order|null $order */
            $order = $orders->get($id);
            if (! $order) {
                $invalid[] = [
                    'order_id' => $id,
                    'reason' => 'Заказ не найден',
                    'missing' => ['заказ'],
                ];
                continue;
            }

            if (trim((string) ($order->shipment_id ?? '')) !== '') {
                $skipped[] = [
                    'order_id' => $id,
                    'reason' => 'Уже есть ID отправки: '.$order->shipment_id,
                ];
                continue;
            }

            $status = (string) ($order->status ?? '');
            if (! in_array($status, VeterTicketPreviewService::SENDABLE_STATUSES, true)) {
                $skipped[] = [
                    'order_id' => $id,
                    'reason' => 'Статус «'.$status.'» — отправка только из: new, confirmed, processing, preorder',
                ];
                continue;
            }

            $built = $this->builder->buildForOrder($order);
            if (! ($built['ok'] ?? false)) {
                $invalid[] = [
                    'order_id' => $id,
                    'reason' => (string) ($built['reason'] ?? 'Не готов к отправке'),
                    'missing' => array_values($built['missing'] ?? []),
                ];
                continue;
            }

            $tickets[] = $built['ticket'];
            $readyOrderIds[] = $id;
        }

        return [
            'tickets' => $tickets,
            'ready_order_ids' => $readyOrderIds,
            'skipped' => $skipped,
            'invalid' => $invalid,
        ];
    }
}

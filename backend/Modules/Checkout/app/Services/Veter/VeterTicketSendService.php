<?php

namespace Modules\Checkout\Services\Veter;

use App\Services\AuditLogService;
use Illuminate\Support\Facades\DB;
use Modules\Checkout\Models\Order;
use Throwable;

class VeterTicketSendService
{
    public function __construct(
        private readonly VeterTicketPreviewService $preview,
        private readonly VeterTicketApiClient $client,
        private readonly AuditLogService $audit,
    ) {}

    /**
     * @param  list<int>  $orderIds
     * @return array{
     *     ready_order_ids: list<int>,
     *     skipped: list<array{order_id: int, reason: string}>,
     *     invalid: list<array{order_id: int, reason: string, missing: list<string>}>,
     *     sent: list<array{order_id: int, shipment_id: string, status: string}>,
     *     failed: list<array{order_id: int, reason: string}>
     * }
     */
    public function send(array $orderIds): array
    {
        $preview = $this->preview->preview($orderIds);
        $tickets = $preview['tickets'];
        $readyOrderIds = $preview['ready_order_ids'];
        $skipped = $preview['skipped'];
        $invalid = $preview['invalid'];

        $sent = [];
        $failed = [];

        foreach ($invalid as $row) {
            $this->auditFailure(
                (int) $row['order_id'],
                (string) $row['reason'],
                [
                    'stage' => 'validation',
                    'missing' => $row['missing'] ?? [],
                ],
            );
        }

        if ($tickets === [] || $readyOrderIds === []) {
            return [
                'ready_order_ids' => $readyOrderIds,
                'skipped' => $skipped,
                'invalid' => $invalid,
                'sent' => [],
                'failed' => [],
            ];
        }

        try {
            $rawResponse = $this->client->createTickets($tickets);
        } catch (Throwable $e) {
            foreach ($readyOrderIds as $orderId) {
                $reason = $e->getMessage();
                $failed[] = [
                    'order_id' => $orderId,
                    'reason' => $reason,
                ];
                $this->auditFailure($orderId, $reason, ['stage' => 'api_request']);
            }

            return [
                'ready_order_ids' => $readyOrderIds,
                'skipped' => $skipped,
                'invalid' => $invalid,
                'sent' => [],
                'failed' => $failed,
            ];
        }

        DB::transaction(function () use ($readyOrderIds, $rawResponse, &$sent, &$failed, &$skipped): void {
            foreach ($readyOrderIds as $index => $orderId) {
                $row = $rawResponse[$index] ?? null;
                if (! is_array($row)) {
                    $reason = 'В ответе Ветер нет результата для этой заявки (index '.$index.')';
                    $failed[] = [
                        'order_id' => $orderId,
                        'reason' => $reason,
                    ];
                    $this->auditFailure($orderId, $reason, [
                        'stage' => 'api_response',
                        'index' => $index,
                    ]);
                    continue;
                }

                // Реальный ответ CreateTickets: {"number":"0","ID":null|string,"desc":"..."}.
                $ticketId = $this->extractTicketId($row);
                $desc = $this->extractDesc($row);

                if ($ticketId === null || $ticketId === '') {
                    $reason = $desc !== ''
                        ? $desc
                        : 'Ветер не вернул ID заявки: '.mb_substr(json_encode($row, JSON_UNESCAPED_UNICODE) ?: '', 0, 400);
                    $failed[] = [
                        'order_id' => $orderId,
                        'reason' => $reason,
                    ];
                    $this->auditFailure($orderId, $reason, [
                        'stage' => 'api_response',
                        'response' => $row,
                    ]);
                    continue;
                }

                $order = Order::query()->lockForUpdate()->find($orderId);
                if (! $order) {
                    $reason = 'Заказ не найден при сохранении shipment_id';
                    $failed[] = [
                        'order_id' => $orderId,
                        'reason' => $reason,
                    ];
                    $this->auditFailure($orderId, $reason, ['stage' => 'persist']);
                    continue;
                }

                if (trim((string) ($order->shipment_id ?? '')) !== '') {
                    $skipped[] = [
                        'order_id' => $orderId,
                        'reason' => 'Уже есть ID отправки: '.$order->shipment_id,
                    ];
                    continue;
                }

                $currentStatus = (string) ($order->status ?? '');
                if (! in_array($currentStatus, VeterTicketPreviewService::SENDABLE_STATUSES, true)) {
                    $skipped[] = [
                        'order_id' => $orderId,
                        'reason' => 'Статус «'.$currentStatus.'» — отправка только из: new, confirmed, processing, preorder',
                    ];
                    continue;
                }

                $order->shipment_id = $ticketId;
                $order->status = VeterTicketPreviewService::STATUS_AFTER_SEND;
                $order->save();

                $sent[] = [
                    'order_id' => $orderId,
                    'shipment_id' => $ticketId,
                    'status' => VeterTicketPreviewService::STATUS_AFTER_SEND,
                ];
            }
        });

        return [
            'ready_order_ids' => $readyOrderIds,
            'skipped' => $skipped,
            'invalid' => $invalid,
            'sent' => $sent,
            'failed' => $failed,
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function auditFailure(int $orderId, string $reason, array $context = []): void
    {
        $this->audit->record(
            AuditLogService::ENTITY_VETER_TICKET,
            $orderId > 0 ? $orderId : null,
            AuditLogService::ACTION_FAILED,
            'Ветер CreateTickets: заказ #'.$orderId.' — '.$reason,
            [
                'order_id' => $orderId,
                'reason' => $reason,
                ...$context,
            ],
        );
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function extractTicketId(array $row): ?string
    {
        foreach (['ID', 'id', 'ticketid', 'ticketId', 'TicketId', 'ticket_id', 'TicketID'] as $key) {
            if (! array_key_exists($key, $row) || $row[$key] === null) {
                continue;
            }
            $value = trim((string) $row[$key]);
            if ($value !== '' && strcasecmp($value, 'null') !== 0) {
                return $value;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function extractDesc(array $row): string
    {
        foreach (['desc', 'Desc', 'description', 'Description', 'message', 'Message', 'error', 'Error'] as $key) {
            if (! array_key_exists($key, $row) || $row[$key] === null) {
                continue;
            }
            $value = trim((string) $row[$key], " \t\n\r\0\x0B,");
            if ($value !== '') {
                return $value;
            }
        }

        return '';
    }
}

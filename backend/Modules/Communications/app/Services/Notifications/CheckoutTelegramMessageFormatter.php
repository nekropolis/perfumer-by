<?php

namespace Modules\Communications\Services\Notifications;

use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\StockNotificationRequest;

class CheckoutTelegramMessageFormatter
{
    public function formatNewOrder(Order $order): string
    {
        $lines = [
            '🛒 Новый заказ',
            '№' . $order->id,
            'Дата: ' . ($order->created_at?->format('d.m.Y H:i') ?? '—'),
            'Клиент: ' . ($order->customer_name ?: 'Без имени'),
            'Телефон: ' . ($order->phone ?: '—'),
            'Статус: ' . ($order->status ?: 'new'),
            'Товаров: ' . (int) ($order->items_qty ?? 0),
            'Сумма: ' . number_format((float) ($order->total ?? 0), 2, '.', '') . ' BYN',
        ];

        if ($order->comment) {
            $lines[] = 'Комментарий: ' . $order->comment;
        }

        $items = $order->relationLoaded('items') ? $order->items : collect();
        if ($items->isNotEmpty()) {
            $lines[] = '';
            $lines[] = 'Позиции:';
            foreach ($items->take(12) as $item) {
                $title = trim(($item->product_name ?? '') . ' ' . ($item->variant_title ?? ''));
                $qty = (int) ($item->qty ?? 0);
                $total = number_format((float) ($item->total ?? 0), 2, '.', '');
                $lines[] = sprintf('- %s × %d = %s BYN', $title !== '' ? $title : 'Товар', $qty, $total);
            }

            if ($items->count() > 12) {
                $lines[] = '... и еще ' . ($items->count() - 12) . ' поз.';
            }
        }

        return $this->trimForTelegram(implode("\n", $lines));
    }

    public function formatCustomerRequest(StockNotificationRequest $record): string
    {
        $kindLabel = match ($record->kind) {
            StockNotificationRequest::KIND_BACK_IN_STOCK => 'Запрос на поступление',
            StockNotificationRequest::KIND_CALLBACK => 'Заказ звонка',
            default => 'Запрос клиента',
        };

        $lines = [
            '📩 ' . $kindLabel,
            '№' . $record->id,
            'Дата: ' . ($record->created_at?->format('d.m.Y H:i') ?? '—'),
            'Телефон: ' . ($record->phone ?: '—'),
            'Статус: ' . ($record->status ?: 'new'),
            'Товар: ' . ($record->product_name ?: '—'),
            'Вариант: ' . ($record->variant_title ?: '—'),
        ];

        if ($record->comment) {
            $lines[] = 'Комментарий: ' . $record->comment;
        }

        return $this->trimForTelegram(implode("\n", $lines));
    }

    private function trimForTelegram(string $text): string
    {
        if (mb_strlen($text) <= 3500) {
            return $text;
        }

        return mb_substr($text, 0, 3500) . "\n...(truncated)";
    }
}

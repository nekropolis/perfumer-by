<?php

namespace Modules\Communications\Services\Notifications;

use Modules\Catalog\Models\VanilleImportJob;

class ImportTelegramMessageFormatter
{
    /**
     * @return string|null
     */
    public function formatVanilleJobFinished(VanilleImportJob $job): ?string
    {
        if (!in_array((string) $job->type, ['pipeline_new_products', 'pipeline_refresh_all'], true)) {
            return null;
        }

        if (!in_array((string) $job->status, ['completed', 'failed'], true)) {
            return null;
        }

        $title = $job->type === 'pipeline_new_products'
            ? 'Vanille: Парсинг нового товара'
            : 'Vanille: Спарсить все товары заново (без изменения цены/наличия/описаний/SEO)';

        $statusLabel = $job->status === 'completed' ? 'выполнено' : 'ошибка';
        $lines = [
            ($job->status === 'completed' ? '✅ ' : '❌ ') . $title,
            'Job #' . $job->id,
            'Статус: ' . $statusLabel,
            'Время: ' . now()->format('d.m.Y H:i:s'),
        ];

        if ($job->message) {
            $lines[] = 'Сообщение: ' . $job->message;
        }
        if ($job->error) {
            $lines[] = 'Ошибка: ' . $job->error;
        }

        return $this->trimForTelegram(implode("\n", $lines));
    }

    /**
     * @param array<string, mixed> $status
     */
    public function formatSellerOneParseFinished(string $jobId, array $status): ?string
    {
        $state = (string) ($status['status'] ?? '');
        if (!in_array($state, ['completed', 'failed'], true)) {
            return null;
        }

        $lines = [
            ($state === 'completed' ? '✅ ' : '❌ ') . 'Seller One: Новый парсинг',
            'Job #' . $jobId,
            'Статус: ' . ($state === 'completed' ? 'выполнено' : 'ошибка'),
            'Обработано: ' . (int) ($status['processed'] ?? 0) . ' / ' . (int) ($status['total_rows'] ?? 0),
            'Обновлено: ' . (int) ($status['updated'] ?? 0),
            'Добавлено: ' . (int) ($status['inserted'] ?? 0),
        ];

        if (!empty($status['message'])) {
            $lines[] = 'Сообщение: ' . (string) $status['message'];
        }

        return $this->trimForTelegram(implode("\n", $lines));
    }

    /**
     * @param array<string, mixed> $status
     */
    public function formatSellerOneRefreshFinished(string $jobId, array $status): ?string
    {
        $state = (string) ($status['status'] ?? '');
        if (!in_array($state, ['completed', 'failed'], true)) {
            return null;
        }

        $lines = [
            ($state === 'completed' ? '✅ ' : '❌ ') . 'Seller One: Обновить цены',
            'Job #' . $jobId,
            'Статус: ' . ($state === 'completed' ? 'выполнено' : 'ошибка'),
            'Связанных товаров: ' . (int) ($status['total_linked'] ?? 0),
            'Обработано строк: ' . (int) ($status['updated'] ?? 0),
            'Цена изменилась: ' . (int) ($status['price_changed'] ?? 0),
            'Пропали из прайса: ' . (int) ($status['missing_codes'] ?? 0),
            'Появились на витрине: ' . (int) ($status['became_in_stock'] ?? 0),
            'Пропущено: ' . (int) ($status['skipped'] ?? 0),
        ];

        if (!empty($status['message'])) {
            $lines[] = 'Сообщение: ' . (string) $status['message'];
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

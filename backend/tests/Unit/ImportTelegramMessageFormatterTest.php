<?php

namespace Tests\Unit;

use Modules\Communications\Services\Notifications\ImportTelegramMessageFormatter;
use PHPUnit\Framework\TestCase;

class ImportTelegramMessageFormatterTest extends TestCase
{
    public function test_completed_parse_is_reported_as_completed_when_progress_counter_is_stale(): void
    {
        $message = (new ImportTelegramMessageFormatter())->formatSellerOneParseFinished('job-id', [
            'status' => 'completed',
            'processed' => 5503,
            'total_rows' => 31503,
            'updated' => 12,
            'inserted' => 3,
        ]);

        self::assertNotNull($message);
        self::assertStringStartsWith('✅ Seller One: Новый парсинг', $message);
        self::assertStringContainsString('Статус: выполнено', $message);
        self::assertStringNotContainsString('частично', $message);
        self::assertStringContainsString('Обновлено: 12', $message);
        self::assertStringContainsString('Добавлено: 3', $message);
    }
}

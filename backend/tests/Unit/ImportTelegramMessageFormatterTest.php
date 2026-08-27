<?php

namespace Tests\Unit;

use Modules\Catalog\Models\VanilleImportJob;
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

    public function test_import_parsed_products_finished_message_includes_counts(): void
    {
        $job = new VanilleImportJob([
            'id' => 8,
            'type' => 'import_parsed_products',
            'status' => 'failed',
            'message' => 'Импорт спарсенных товаров: 350 / 355 файлов',
            'error' => 'attempted too many times',
            'result' => [
                'imported' => 452,
                'updated' => 0,
                'errors' => 0,
                'items' => 700,
                'processed_files' => 350,
                'total_files' => 355,
            ],
        ]);

        $message = (new ImportTelegramMessageFormatter())->formatVanilleJobFinished($job);

        self::assertNotNull($message);
        self::assertStringStartsWith('❌ Vanille: Импорт спарсенных товаров', $message);
        self::assertStringContainsString('Создано товаров: 452', $message);
        self::assertStringContainsString('Файлы: 350 / 355', $message);
    }
}

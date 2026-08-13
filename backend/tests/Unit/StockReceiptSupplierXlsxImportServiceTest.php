<?php

namespace Tests\Unit;

use Illuminate\Http\UploadedFile;
use Modules\Warehouse\Services\StockInventoryService;
use Modules\Warehouse\Services\StockReceiptService;
use Modules\Warehouse\Services\StockReceiptSupplierXlsxImportService;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use ReflectionMethod;
use Tests\TestCase;

class StockReceiptSupplierXlsxImportServiceTest extends TestCase
{
    public function test_read_rows_skips_header_and_defaults_empty_qty_to_one(): void
    {
        $path = $this->makeTempXlsx([
            ['Партномер', 'Название', 'Цена', 'Кол-во'],
            ['SKU-1', 'Product One', '10.5', ''],
            ['SKU-2', 'Product Two', '20', '3'],
            ['', '', '', ''],
            ['SKU-3', 'Product Three', '1,25', '2'],
        ]);

        $service = $this->makeService();
        $method = new ReflectionMethod(StockReceiptSupplierXlsxImportService::class, 'readRows');
        $method->setAccessible(true);

        $rows = $method->invoke($service, new UploadedFile($path, 'receipt.xlsx', null, null, true));

        self::assertCount(3, $rows);
        self::assertSame([
            'code' => 'SKU-1',
            'title' => 'Product One',
            'supplier_price' => 10.5,
            'qty' => 1,
        ], $rows[0]);
        self::assertSame(3, $rows[1]['qty']);
        self::assertSame('SKU-3', $rows[2]['code']);
        self::assertSame(1.25, $rows[2]['supplier_price']);
        self::assertSame(2, $rows[2]['qty']);

        @unlink($path);
    }

    public function test_build_comment_appends_unmatched_lines(): void
    {
        $service = $this->makeService();
        $method = new ReflectionMethod(StockReceiptSupplierXlsxImportService::class, 'buildComment');
        $method->setAccessible(true);

        $comment = $method->invoke($service, 'Базовый комментарий', [
            'A1 — Name — 1',
            'A2 — Other — 2',
        ]);

        self::assertStringContainsString('Базовый комментарий', (string) $comment);
        self::assertStringContainsString('Без связи (2):', (string) $comment);
        self::assertStringContainsString('A1 — Name — 1', (string) $comment);
        self::assertStringContainsString('A2 — Other — 2', (string) $comment);
    }

    private function makeService(): StockReceiptSupplierXlsxImportService
    {
        return new StockReceiptSupplierXlsxImportService(
            $this->createMock(StockReceiptService::class),
            $this->createMock(StockInventoryService::class),
        );
    }

    private function makeTempXlsx(array $rows): string
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->fromArray($rows, null, 'A1', true);

        $path = tempnam(sys_get_temp_dir(), 'receipt_xlsx_').'.xlsx';
        (new Xlsx($spreadsheet))->save($path);

        return $path;
    }
}

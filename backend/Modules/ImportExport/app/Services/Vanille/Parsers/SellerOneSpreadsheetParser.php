<?php

namespace Modules\ImportExport\Services\Vanille\Parsers;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Modules\ImportExport\Services\Vanille\Support\SellerOneVariantMatcher;

class SellerOneSpreadsheetParser
{
    public function __construct(
        private readonly SellerOneVariantMatcher $matcher,
    ) {
    }

    public function readRowsFromFile(UploadedFile $file): array
    {
        return $this->readRowsFromPath($file->getRealPath());
    }

    /**
     * Прямое чтение XLSX с максимальной экономией памяти:
     *  - setReadDataOnly(true): игнорируем стили/формулы/форматирование;
     *  - disconnectWorksheets() + unset: PhpSpreadsheet держит циклические
     *    ссылки между Worksheet/Cell, без явного разрыва GC долго не освобождает
     *    сотни мегабайт. Это официально рекомендуемый способ.
     *
     * Вызывайте этот метод, когда файл уже гарантированно лежит на диске —
     * не нужно оборачивать его в UploadedFile ради чтения.
     */
    public function readRowsFromPath(string $absolutePath): array
    {
        $ioFactoryClass = '\\PhpOffice\\PhpSpreadsheet\\IOFactory';

        if (!class_exists($ioFactoryClass)) {
            throw new \RuntimeException('Не установлен phpoffice/phpspreadsheet. Выполни composer install в backend.');
        }

        /** @var \PhpOffice\PhpSpreadsheet\Reader\IReader $reader */
        $reader = $ioFactoryClass::createReaderForFile($absolutePath);
        if (method_exists($reader, 'setReadDataOnly')) {
            $reader->setReadDataOnly(true);
        }

        $spreadsheet = $reader->load($absolutePath);
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray(null, false, false, false);

        $result = [];
        foreach ($rows as $index => $row) {
            $code = trim((string) ($row[0] ?? ''));
            $title = trim((string) ($row[1] ?? ''));

            if ($index === 0 && Str::lower($code) === 'код') {
                continue;
            }

            if ($code === '' || $title === '') {
                continue;
            }

            $result[] = [
                'code' => $code,
                'title' => $title,
                'supplier_price' => $this->matcher->toFloat($row[2] ?? null),
            ];
        }

        // Явно разрываем циклические ссылки PhpSpreadsheet, иначе RSS висит вплоть до --max-time.
        unset($rows, $sheet);
        if (method_exists($spreadsheet, 'disconnectWorksheets')) {
            $spreadsheet->disconnectWorksheets();
        }
        unset($spreadsheet, $reader);
        if (function_exists('gc_collect_cycles')) {
            gc_collect_cycles();
        }

        return $result;
    }
}

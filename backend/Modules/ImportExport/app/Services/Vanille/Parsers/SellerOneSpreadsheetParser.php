<?php

namespace Modules\ImportExport\Services\Vanille\Parsers;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Modules\ImportExport\Services\Vanille\Support\SellerOneVariantMatcher;
use Modules\ImportExport\Services\Vanille\Support\SupplierPriceProfile;

class SellerOneSpreadsheetParser
{
    public function __construct(
        private readonly SellerOneVariantMatcher $matcher,
    ) {
    }

    /**
     * Лёгкая проверка сигнатуры без полного разбора всех строк в результат.
     */
    public function assertPathMatchesProfile(string $absolutePath, SupplierPriceProfile $profile): void
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
        $rawRows = $sheet->toArray(null, false, false, false);

        try {
            $profile->assertFileMatchesSignature($rawRows);
            $this->assertParsedRowsValid($rawRows, $this->peekParsedSample($rawRows, $profile));
        } finally {
            if (method_exists($spreadsheet, 'disconnectWorksheets')) {
                $spreadsheet->disconnectWorksheets();
            }
            unset($spreadsheet, $reader, $rawRows);
        }
    }

    /**
     * @param  list<array<int, mixed>>  $rawRows
     * @return list<array{code: string, title: string, supplier_price: ?float, in_stock: ?bool}>
     */
    private function peekParsedSample(array $rawRows, SupplierPriceProfile $profile): array
    {
        $map = $this->resolveColumnMapping($rawRows, $profile);
        $result = [];
        $limit = min(200, count($rawRows));

        for ($rowIndex = 0; $rowIndex < $limit; $rowIndex++) {
            $row = $rawRows[$rowIndex] ?? null;
            if (! is_array($row)) {
                continue;
            }
            if ($map['header_row_index'] !== null && $rowIndex === $map['header_row_index']) {
                continue;
            }

            $code = trim((string) ($row[$map['code']] ?? ''));
            $title = trim((string) ($row[$map['title']] ?? ''));
            if ($code === '' || $title === '') {
                continue;
            }

            $result[] = [
                'code' => $code,
                'title' => $title,
                'supplier_price' => $this->matcher->toFloat($row[$map['price']] ?? null),
                'in_stock' => null,
            ];
        }

        return $result;
    }

    /**
     * @return list<array{code: string, title: string, supplier_price: ?float, in_stock: ?bool}>
     */
    public function readRowsFromFile(UploadedFile $file, ?SupplierPriceProfile $profile = null): array
    {
        $path = $file->getRealPath();

        if (!$path) {
            throw new \InvalidArgumentException('Не удалось прочитать загруженный файл.');
        }

        return $this->readRowsFromPath($path, $profile);
    }

    /**
     * Читает строки прайса. Опциональная колонка «наличие» (по заголовку или 4-й колонке):
     * да / нет / + / - / 1 / 0 / число (>0 — в наличии).
     *
     * @return list<array{code: string, title: string, supplier_price: ?float, in_stock: ?bool}>
     */
    public function readRowsFromPath(string $absolutePath, ?SupplierPriceProfile $profile = null): array
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
        $rawRows = $sheet->toArray(null, false, false, false);

        if ($profile !== null) {
            $profile->assertFileMatchesSignature($rawRows);
        }

        $result = [];
        $map = [
            'code' => 0,
            'title' => 1,
            'price' => 2,
            'stock' => null,
            'header_row_index' => null,
        ];

        if ($rawRows !== []) {
            $map = $this->resolveColumnMapping($rawRows, $profile);
            foreach ($rawRows as $rowIndex => $row) {
                if ($map['header_row_index'] !== null && $rowIndex === $map['header_row_index']) {
                    continue;
                }

                $code = trim((string) ($row[$map['code']] ?? ''));
                $title = trim((string) ($row[$map['title']] ?? ''));

                if ($map['header_row_index'] === null && $rowIndex === 0 && Str::lower($code) === 'код') {
                    continue;
                }

                if ($code === '' || $title === '') {
                    continue;
                }

                $price = $this->matcher->toFloat($row[$map['price']] ?? null);
                $inStock = $this->parseInStockValue($row, $map['stock']);

                $result[] = [
                    'code' => $code,
                    'title' => $title,
                    'supplier_price' => $price,
                    'in_stock' => $inStock,
                ];
            }
        }

        $rawRowsForValidation = $rawRows;
        unset($rawRows, $sheet);
        if (method_exists($spreadsheet, 'disconnectWorksheets')) {
            $spreadsheet->disconnectWorksheets();
        }
        unset($spreadsheet, $reader);
        if (function_exists('gc_collect_cycles')) {
            gc_collect_cycles();
        }

        $this->assertParsedRowsValid($rawRowsForValidation, $result);

        return $result;
    }

    private const FORMAT_ERROR_MESSAGE = 'Неверный формат прайса. Ожидаются колонки: код, название, цена (первая строка может быть заголовком с «код» в первой колонке).';

    /**
     * @param  list<array<int, mixed>>  $rawRows
     * @param  list<array{code: string, title: string, supplier_price: ?float, in_stock: ?bool}>  $parsedRows
     */
    private function assertParsedRowsValid(array $rawRows, array $parsedRows): void
    {
        foreach ($parsedRows as $row) {
            if ($row['supplier_price'] !== null) {
                return;
            }
        }

        if ($rawRows === []) {
            throw new \InvalidArgumentException('Файл прайса пуст или не содержит данных.');
        }

        $nonEmptyRows = 0;
        foreach ($rawRows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $hasContent = false;
            foreach ($row as $cell) {
                if (trim((string) $cell) !== '') {
                    $hasContent = true;
                    break;
                }
            }

            if ($hasContent) {
                $nonEmptyRows++;
            }
        }

        if ($nonEmptyRows === 0) {
            throw new \InvalidArgumentException('Файл прайса пуст или не содержит данных.');
        }

        throw new \InvalidArgumentException(self::FORMAT_ERROR_MESSAGE);
    }

    /**
     * @param  list<array<int, mixed>>  $rows
     * @return array{code: int, title: int, price: int, stock: ?int, header_row_index: ?int}
     */
    private function resolveColumnMapping(array $rows, ?SupplierPriceProfile $profile = null): array
    {
        $default = [
            'code' => 0,
            'title' => 1,
            'price' => 2,
            'stock' => null,
            'header_row_index' => null,
        ];

        $allowFallbackStockCol = $profile === null || $profile->treatOrderColumnAsStock();

        foreach ($rows as $idx => $row) {
            if (!is_array($row)) {
                continue;
            }
            $first = trim(Str::lower((string) ($row[0] ?? '')));
            if ($first !== 'код') {
                continue;
            }

            $stockCol = null;
            foreach ($row as $colIdx => $headerCell) {
                $h = mb_strtolower(trim((string) $headerCell), 'UTF-8');
                if ($h === '') {
                    continue;
                }
                if ($h === 'заказ' || str_starts_with($h, 'заказ')) {
                    continue;
                }
                if (str_contains($h, 'налич') || str_contains($h, 'остат') || $h === 'н' || str_contains($h, 'кол-во')) {
                    $stockCol = (int) $colIdx;
                    break;
                }
            }

            if ($stockCol === null && $allowFallbackStockCol && count($row) > 3) {
                $fourth = mb_strtolower(trim((string) ($row[3] ?? '')), 'UTF-8');
                if ($fourth !== 'заказ' && ! str_starts_with($fourth, 'заказ')) {
                    $stockCol = 3;
                }
            }

            return [
                'code' => 0,
                'title' => 1,
                'price' => 2,
                'stock' => $stockCol,
                'header_row_index' => $idx,
            ];
        }

        $firstData = $rows[0] ?? null;
        if ($allowFallbackStockCol && is_array($firstData) && count($firstData) > 3) {
            $default['stock'] = 3;
        }

        return $default;
    }

    /**
     * @param  array<int, mixed>  $row
     */
    private function parseInStockValue(array $row, ?int $stockCol): ?bool
    {
        if ($stockCol === null) {
            return null;
        }

        $raw = $row[$stockCol] ?? null;
        if ($raw === null || $raw === '') {
            return null;
        }

        if (is_numeric($raw)) {
            return ((float) $raw) > 0;
        }

        $s = mb_strtolower(trim((string) $raw), 'UTF-8');
        if ($s === '' || $s === '—' || $s === '-') {
            return null;
        }

        if (in_array($s, ['нет', 'no', 'н', '-', '0', 'false', 'off', 'x', 'нет в наличии', 'отсутствует'], true)) {
            return false;
        }

        if (in_array($s, ['да', 'yes', 'д', '+', 'есть', 'true', 'on', 'в наличии', 'нал'], true)) {
            return true;
        }

        return null;
    }
}

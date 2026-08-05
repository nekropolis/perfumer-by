<?php

namespace Modules\Checkout\Services;

use Modules\Catalog\Models\Supplier;
use Modules\Catalog\Support\CatalogVariantStockPresenter;
use Modules\Checkout\Models\SupplierOrder;
use Modules\Checkout\Models\SupplierOrderItem;
use Modules\ImportExport\Services\Vanille\Support\SupplierPriceProfile;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Экспорт заказа поставщику в XLSX в формате прайса этого поставщика.
 */
class SupplierOrderXlsxExporter
{
    public function download(SupplierOrder $order): StreamedResponse
    {
        $order->loadMissing(['supplier', 'items.supplierVariantOffer']);

        $supplier = $order->supplier;
        $code = SupplierPriceProfile::normalizeCode((string) ($supplier?->code ?? ''));

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle($this->sheetTitle($supplier));

        if ($code === SupplierPriceProfile::CODE_LAGDOS) {
            $this->writeLagdos($sheet, $order);
        } else {
            // EDP и прочие: Код | Название | Цена (+ Кол-во для заявки).
            $this->writeEdpStyle($sheet, $order);
        }

        $filename = $this->filename($order, $supplier);

        return response()->streamDownload(function () use ($spreadsheet): void {
            $writer = new Xlsx($spreadsheet);
            $writer->save('php://output');
        }, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    private function writeEdpStyle($sheet, SupplierOrder $order): void
    {
        // Как прайс EDP: Код | Название | Цена; 4-я колонка — кол-во заявки.
        $sheet->setCellValue('A1', 'Код');
        $sheet->setCellValue('B1', 'Название');
        $sheet->setCellValue('C1', 'Цена');
        $sheet->setCellValue('D1', 'Кол-во');

        $rowNum = 2;
        $maxTitleLen = 12;
        foreach ($order->items as $item) {
            $title = (string) ($item->supplier_product_name ?? '');
            $sheet->setCellValueExplicit('A'.$rowNum, (string) ($item->supplier_code ?? ''), DataType::TYPE_STRING);
            $sheet->setCellValue('B'.$rowNum, $title);
            $price = $this->currentPurchasePrice($item);
            if ($price !== null) {
                $sheet->setCellValueExplicit('C'.$rowNum, $price, DataType::TYPE_NUMERIC);
            }
            $sheet->setCellValueExplicit('D'.$rowNum, (int) $item->qty, DataType::TYPE_NUMERIC);
            $maxTitleLen = max($maxTitleLen, mb_strlen($title, 'UTF-8'));
            $rowNum++;
        }

        $sheet->getColumnDimension('A')->setWidth(14);
        $sheet->getColumnDimension('B')->setWidth(min(80, max(28, $maxTitleLen + 2)));
        $sheet->getColumnDimension('C')->setWidth(12);
        $sheet->getColumnDimension('D')->setWidth(10);
    }

    private function writeLagdos($sheet, SupplierOrder $order): void
    {
        $sheet->setCellValue('A1', 'Код');
        $sheet->setCellValue('B1', 'Название');
        $sheet->setCellValue('C1', 'Цена');
        $sheet->setCellValue('D1', 'Заказ');

        $rowNum = 2;
        $maxTitleLen = 12;
        foreach ($order->items as $item) {
            $title = (string) ($item->supplier_product_name ?? '');
            $sheet->setCellValueExplicit('A'.$rowNum, (string) ($item->supplier_code ?? ''), DataType::TYPE_STRING);
            $sheet->setCellValue('B'.$rowNum, $title);
            $price = $this->currentPurchasePrice($item);
            if ($price !== null) {
                $sheet->setCellValueExplicit('C'.$rowNum, $price, DataType::TYPE_NUMERIC);
            }
            $sheet->setCellValueExplicit('D'.$rowNum, (int) $item->qty, DataType::TYPE_NUMERIC);
            $maxTitleLen = max($maxTitleLen, mb_strlen($title, 'UTF-8'));
            $rowNum++;
        }

        $sheet->getColumnDimension('A')->setWidth(14);
        $sheet->getColumnDimension('B')->setWidth(min(80, max(28, $maxTitleLen + 2)));
        $sheet->getColumnDimension('C')->setWidth(12);
        $sheet->getColumnDimension('D')->setWidth(10);
    }

    private function currentPurchasePrice(SupplierOrderItem $item): ?float
    {
        $offer = $item->supplierVariantOffer;
        if ($offer) {
            $resolved = CatalogVariantStockPresenter::resolveListingPurchasePrice($offer);
            if ($resolved !== null) {
                return round($resolved, 2);
            }
            if ($offer->purchase_price !== null) {
                return round((float) $offer->purchase_price, 2);
            }
        }

        return null;
    }

    private function sheetTitle(?Supplier $supplier): string
    {
        $name = trim((string) ($supplier?->name ?? 'Заказ'));
        $safe = preg_replace('/[\\\\\\/\\?\\*\\[\\]:]/u', '', $name) ?: 'Заказ';

        return mb_substr($safe, 0, 31, 'UTF-8');
    }

    private function filename(SupplierOrder $order, ?Supplier $supplier): string
    {
        $number = (string) ($order->number ?: ('order-'.$order->id));
        $safe = preg_replace('/[^\p{L}\p{N}\-_]+/u', '-', $number) ?: 'order';

        return $safe.'.xlsx';
    }
}

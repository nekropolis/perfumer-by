import type { ReactNode } from "react";
import type { ProductVariantSupplierItem } from "@/lib/admin-products-api";

type Props = {
    variant: ProductVariantSupplierItem;
    cellClassName: string;
};

function warehouseCellsPair(
    warehouses: Array<{
        warehouse_name: string | null;
        stock: number;
        available_stock: number;
        virtual_price_channel?: boolean;
    }>,
    cellClassName: string,
): [ReactNode, ReactNode] {
    if (warehouses.length === 0) {
        return [
            <td key="wh-n" className={cellClassName}>
                —
            </td>,
            <td key="wh-q" className={cellClassName}>
                —
            </td>,
        ];
    }

    return [
        <td key="wh-n" className={cellClassName}>
            {warehouses.map((w) => w.warehouse_name || "—").join(", ")}
        </td>,
        <td key="wh-q" className={cellClassName}>
            {warehouses
                .map((w) => `${w.stock} шт.${w.virtual_price_channel ? " · оценка" : ""}`)
                .join(", ")}
        </td>,
    ];
}

type DetailLine = { key: string; cells: ReactNode[] };

function buildDetailLines(variant: ProductVariantSupplierItem, cellClassName: string): DetailLine[] {
    const mainStore = variant.main_store_rows ?? [];
    const suppliers = variant.suppliers ?? [];
    const supplierWarehouses = variant.supplier_warehouses ?? [];
    const receiptBatches = variant.receipt_batches ?? [];
    const allWarehouses = variant.warehouses ?? [];

    const lines: DetailLine[] = [];

    mainStore.forEach((row) => {
        lines.push({
            key: `main-store-${row.receipt_item_id}`,
            cells: [
                <td key="c1" className={cellClassName}>
                    {row.supplier_name}
                </td>,
                <td key="c2" className={cellClassName}>
                    {row.supplier_code}
                </td>,
                <td key="c3" className={cellClassName}>
                    {row.supplier_product_name}
                </td>,
                <td key="c4" className={cellClassName}>
                    {row.supplier_price ?? "—"}
                </td>,
                <td key="c5" className={cellClassName}>
                    {row.warehouse_name || "—"}
                </td>,
                <td key="c6" className={cellClassName}>
                    {row.qty} шт.
                </td>,
            ],
        });
    });

    suppliers.forEach((supplier) => {
        const [whName, whQty] = warehouseCellsPair(supplierWarehouses, cellClassName);
        lines.push({
            key: `supplier-offer-${supplier.offer_id}`,
            cells: [
                <td key="c1" className={cellClassName}>
                    {supplier.supplier_name || "—"}
                </td>,
                <td key="c2" className={cellClassName}>
                    {supplier.supplier_code || "—"}
                </td>,
                <td key="c3" className={cellClassName}>
                    {supplier.supplier_product_name || "—"}
                </td>,
                <td key="c4" className={cellClassName}>
                    {supplier.supplier_price ?? "—"}
                </td>,
                whName,
                whQty,
            ],
        });
    });

    if (lines.length === 0 && receiptBatches.length > 0) {
        receiptBatches.forEach((batch) => {
            lines.push({
                key: `receipt-batch-${batch.receipt_item_id}`,
                cells: [
                    <td key="c1" className={cellClassName}>
                        {batch.supplier_name || "Магазин"}
                    </td>,
                    <td key="c2" className={cellClassName}>
                        {batch.supplier_code
                            || (batch.receipt_document_no ? `#${batch.receipt_document_no}` : `#${batch.receipt_id}`)}
                    </td>,
                    <td key="c3" className={cellClassName}>
                        {batch.supplier_product_name || "—"}
                    </td>,
                    <td key="c4" className={cellClassName}>
                        {batch.supplier_price ?? "—"}
                    </td>,
                    <td key="c5" className={cellClassName}>
                        {batch.warehouse_name || "—"}
                    </td>,
                    <td key="c6" className={cellClassName}>
                        {batch.qty} шт.
                    </td>,
                ],
            });
        });
    }

    if (lines.length === 0 && allWarehouses.length > 0) {
        allWarehouses.forEach((warehouse, idx) => {
            lines.push({
                key: `warehouse-only-${variant.id}-${idx}`,
                cells: [
                    <td key="c1" className={`${cellClassName} text-gray-500`}>
                        Магазин
                    </td>,
                    <td key="c2" className={`${cellClassName} text-gray-500`}>
                        —
                    </td>,
                    <td key="c3" className={`${cellClassName} text-gray-500`}>
                        Складской остаток
                    </td>,
                    <td key="c4" className={`${cellClassName} text-gray-500`}>
                        —
                    </td>,
                    <td key="c5" className={cellClassName}>
                        {warehouse.warehouse_name || "—"}
                    </td>,
                    <td key="c6" className={cellClassName}>
                        {warehouse.stock} шт.
                    </td>,
                ],
            });
        });
    }

    return lines;
}

/**
 * Строки таблицы «поставщик / склад»: приходы на основной склад, офферы поставщиков, прочие приходы.
 */
export default function VariantSuppliersTableRows({ variant, cellClassName }: Props) {
    const lines = buildDetailLines(variant, cellClassName);
    const emptyMessage = "Для этого варианта нет активных привязок.";

    if (lines.length === 0) {
        return (
            <tr className="border-t">
                <td colSpan={6} className={`${cellClassName} text-gray-500`}>
                    {emptyMessage}
                </td>
            </tr>
        );
    }

    return (
        <>
            {lines.map((line) => (
                <tr key={line.key} className="border-t">
                    {line.cells}
                </tr>
            ))}
        </>
    );
}

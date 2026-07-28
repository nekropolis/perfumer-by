import type { ReactNode } from "react";
import type { ProductVariantSupplierItem } from "@/lib/admin-products-api";
import { roundMoneyToTenths } from "@/lib/loyalty-pricing";

type Props = {
    variant: ProductVariantSupplierItem;
    cellClassName: string;
};

const ON_WAREHOUSE_LABEL = "на складе";

type DetailLine = { key: string; cells: ReactNode[] };

function formatSupplierPurchasePrice(value: string | number | null | undefined): string {
    if (value == null || value === "") {
        return "—";
    }
    const rounded = roundMoneyToTenths(String(value));
    return rounded ?? String(value);
}

function warehouseQtyCell(
    warehouses: Array<{
        warehouse_name: string | null;
        stock: number;
        available_stock: number;
    }>,
    cellClassName: string,
): ReactNode {
    if (warehouses.length === 0) {
        return (
            <td key="wh-q" className={cellClassName}>
                —
            </td>
        );
    }

    return (
        <td key="wh-q" className={cellClassName}>
            {warehouses.map((w) => `${w.stock} шт.`).join(", ")}
        </td>
    );
}

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
                    {ON_WAREHOUSE_LABEL}
                </td>,
                <td key="c2" className={cellClassName}>
                    {row.supplier_code}
                </td>,
                <td key="c3" className={cellClassName}>
                    {row.supplier_product_name}
                </td>,
                <td key="c4" className={cellClassName}>
                    {formatSupplierPurchasePrice(row.supplier_price)}
                </td>,
                <td key="c5" className={cellClassName}>
                    {row.qty} шт.
                </td>,
            ],
        });
    });

    suppliers.forEach((supplier) => {
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
                    {formatSupplierPurchasePrice(supplier.supplier_price)}
                </td>,
                warehouseQtyCell(supplierWarehouses, cellClassName),
            ],
        });
    });

    if (lines.length === 0 && receiptBatches.length > 0) {
        receiptBatches.forEach((batch) => {
            lines.push({
                key: `receipt-batch-${batch.receipt_item_id}`,
                cells: [
                    <td key="c1" className={cellClassName}>
                        {ON_WAREHOUSE_LABEL}
                    </td>,
                    <td key="c2" className={cellClassName}>
                        {batch.supplier_code
                            || (batch.receipt_document_no ? `#${batch.receipt_document_no}` : `#${batch.receipt_id}`)}
                    </td>,
                    <td key="c3" className={cellClassName}>
                        {batch.supplier_product_name || "—"}
                    </td>,
                    <td key="c4" className={cellClassName}>
                        {formatSupplierPurchasePrice(batch.supplier_price)}
                    </td>,
                    <td key="c5" className={cellClassName}>
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
                    <td key="c1" className={cellClassName}>
                        {ON_WAREHOUSE_LABEL}
                    </td>,
                    <td key="c2" className={`${cellClassName} text-admin-text-secondary`}>
                        —
                    </td>,
                    <td key="c3" className={`${cellClassName} text-admin-text-secondary`}>
                        Складской остаток
                    </td>,
                    <td key="c4" className={`${cellClassName} text-admin-text-secondary`}>
                        —
                    </td>,
                    <td key="c5" className={cellClassName}>
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
                <td colSpan={5} className={`${cellClassName} text-admin-text-secondary`}>
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

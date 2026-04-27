import type { ReactNode } from "react";
import type { ProductVariantSupplierItem } from "@/lib/admin-products-api";

type Props = {
    variant: ProductVariantSupplierItem;
    cellClassName: string;
};

function warehouseCells(
    warehouses: Array<{ warehouse_name: string | null; stock: number; available_stock: number }>,
    cellClassName: string,
) {
    if (warehouses.length === 0) {
        return (
            <>
                <td className={cellClassName}>—</td>
                <td className={cellClassName}>—</td>
            </>
        );
    }

    return (
        <>
            <td className={cellClassName}>
                {warehouses.map((w) => w.warehouse_name || "—").join(", ")}
            </td>
            <td className={cellClassName}>
                {warehouses.map((w) => `${w.stock} шт.`).join(", ")}
            </td>
        </>
    );
}

/**
 * Строки таблицы «поставщик / склад» в модалке вариантов: сначала остаток по приходам на основной склад
 * (канал «Магазин»), затем офферы поставщиков, затем прочие приходы и склад без привязок.
 */
export default function VariantSuppliersTableRows({ variant, cellClassName }: Props) {
    const mainStore = variant.main_store_rows ?? [];
    const suppliers = variant.suppliers ?? [];
    const supplierWarehouses = variant.supplier_warehouses ?? [];
    const receiptBatches = variant.receipt_batches ?? [];
    const allWarehouses = variant.warehouses ?? [];

    const rows: ReactNode[] = [];

    mainStore.forEach((row) => {
        rows.push(
            <tr key={`main-store-${row.receipt_item_id}`} className="border-t">
                <td className={cellClassName}>{row.supplier_name}</td>
                <td className={cellClassName}>{row.supplier_code}</td>
                <td className={cellClassName}>{row.supplier_product_name}</td>
                <td className={cellClassName}>{row.supplier_price ?? "—"}</td>
                <td className={cellClassName}>{row.warehouse_name || "—"}</td>
                <td className={cellClassName}>{row.qty} шт.</td>
            </tr>,
        );
    });

    suppliers.forEach((supplier) => {
        rows.push(
            <tr key={`supplier-offer-${supplier.offer_id}`} className="border-t">
                <td className={cellClassName}>{supplier.supplier_name || "—"}</td>
                <td className={cellClassName}>{supplier.supplier_code || "—"}</td>
                <td className={cellClassName}>{supplier.supplier_product_name || "—"}</td>
                <td className={cellClassName}>{supplier.supplier_price ?? "—"}</td>
                {warehouseCells(supplierWarehouses, cellClassName)}
            </tr>,
        );
    });

    if (rows.length === 0 && receiptBatches.length > 0) {
        receiptBatches.forEach((batch) => {
            rows.push(
                <tr key={`receipt-batch-${batch.receipt_item_id}`} className="border-t">
                    <td className={cellClassName}>{batch.supplier_name || "Магазин"}</td>
                    <td className={cellClassName}>
                        {batch.supplier_code
                            || (batch.receipt_document_no ? `#${batch.receipt_document_no}` : `#${batch.receipt_id}`)}
                    </td>
                    <td className={cellClassName}>{batch.supplier_product_name || "—"}</td>
                    <td className={cellClassName}>{batch.supplier_price ?? "—"}</td>
                    <td className={cellClassName}>{batch.warehouse_name || "—"}</td>
                    <td className={cellClassName}>{batch.qty} шт.</td>
                </tr>,
            );
        });
    }

    if (rows.length === 0 && allWarehouses.length > 0) {
        allWarehouses.forEach((warehouse, idx) => {
            rows.push(
                <tr key={`warehouse-only-${variant.id}-${idx}`} className="border-t">
                    <td className={`${cellClassName} text-gray-500`}>Магазин</td>
                    <td className={`${cellClassName} text-gray-500`}>—</td>
                    <td className={`${cellClassName} text-gray-500`}>Складской остаток</td>
                    <td className={`${cellClassName} text-gray-500`}>—</td>
                    <td className={cellClassName}>{warehouse.warehouse_name || "—"}</td>
                    <td className={cellClassName}>{warehouse.stock} шт.</td>
                </tr>,
            );
        });
    }

    if (rows.length === 0) {
        return (
            <tr className="border-t">
                <td colSpan={6} className={`${cellClassName} text-gray-500`}>
                    Для этого варианта нет активных привязок.
                </td>
            </tr>
        );
    }

    return <>{rows}</>;
}

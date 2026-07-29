"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import WriteoffEditorPage from "@/components/admin/warehouse/writeoff-editor-page";

function NewWriteoffPageContent() {
    const searchParams = useSearchParams();

    const prefillItem = useMemo(() => {
        const warehouseId = Number(searchParams.get("warehouse_id") || 0);
        const productId = Number(searchParams.get("product_id") || 0);
        const variantId = Number(searchParams.get("variant_id") || 0);
        const productName = searchParams.get("product_name") || "";
        const variantTitle = searchParams.get("variant_title") || "";
        const price = searchParams.get("price");
        const availableQty = Number(searchParams.get("available_qty") || 0);
        const reservedQty = Number(searchParams.get("reserved_qty") || 0);

        const stockLotId = Number(searchParams.get("stock_lot_id") || 0);

        if (!productId || !variantId || !productName || !variantTitle) {
            return null;
        }

        return {
            warehouse_id: warehouseId || null,
            product_id: productId,
            variant_id: variantId,
            product_name: productName,
            variant_title: variantTitle,
            price,
            available_qty: availableQty,
            reserved_qty: reservedQty,
            stock_lot_id: stockLotId > 0 ? stockLotId : null,
        };
    }, [searchParams]);

    return <WriteoffEditorPage prefillItem={prefillItem} />;
}

export default function NewWriteoffPage() {
    return (
        <Suspense fallback={null}>
            <NewWriteoffPageContent />
        </Suspense>
    );
}

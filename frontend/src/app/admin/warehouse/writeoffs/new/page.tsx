"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import WriteoffEditorPage from "@/components/admin/warehouse/writeoff-editor-page";

export default function NewWriteoffPage() {
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
        };
    }, [searchParams]);

    return <WriteoffEditorPage prefillItem={prefillItem} />;
}

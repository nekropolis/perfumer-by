"use client";

import { useParams } from "next/navigation";
import ReceiptEditorPage from "@/components/admin/warehouse/receipt-editor-page";

export default function AdminWarehouseReceiptEditPage() {
    const params = useParams<{ id: string }>();

    return <ReceiptEditorPage receiptId={Number(params.id)} />;
}

"use client";

import { useParams } from "next/navigation";
import ReceiptShowPage from "@/components/admin/warehouse/receipt-show-page";

export default function AdminWarehouseReceiptShowPage() {
    const params = useParams<{ id: string }>();

    return <ReceiptShowPage receiptId={Number(params.id)} />;
}


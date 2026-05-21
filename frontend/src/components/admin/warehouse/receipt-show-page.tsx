"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import { fetchStockReceipt, type StockReceiptListItem } from "@/lib/admin-warehouse-api";
import { getStockReceiptStatusLabel } from "@/lib/warehouse-document-status";

type Props = {
    receiptId: number;
};

function formatDate(value?: string | null): string {
    if (!value) {
        return "Не указана";
    }

    try {
        return new Date(value).toLocaleString("ru-RU");
    } catch {
        return value;
    }
}

export default function ReceiptShowPage({ receiptId }: Props) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [receipt, setReceipt] = useState<StockReceiptListItem | null>(null);

    useEffect(() => {
        const run = async () => {
            setLoading(true);
            setError("");
            try {
                const res = await fetchStockReceipt(receiptId);
                setReceipt(res.data);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Не удалось загрузить приход");
            } finally {
                setLoading(false);
            }
        };
        void run();
    }, [receiptId]);

    return (
        <AdminPageCard>
            <Breadcrumbs
                className="mb-4"
                items={[
                    { label: "Админка", href: "/admin" },
                    { label: "Склад", href: "/admin/warehouse/receipts" },
                    { label: "Приходы", href: "/admin/warehouse/receipts" },
                    { label: `Просмотр #${receiptId}` },
                ]}
            />

            <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
                        Приход #{receipt?.document_no ?? receiptId}
                    </h1>
                    {receipt?.status ? (
                        <p className="mt-1 text-sm font-medium text-slate-700">
                            Статус: {getStockReceiptStatusLabel(receipt.status)}
                        </p>
                    ) : null}
                </div>
                <Link
                    href="/admin/warehouse/receipts"
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                    Назад
                </Link>
            </div>

            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                </div>
            ) : null}

            {loading ? (
                <AdminLoadingState text="Загрузка прихода..." />
            ) : receipt ? (
                <div className="space-y-4">
                    <div className="rounded-xl border border-admin-border bg-admin-surface shadow-admin-card p-4 shadow-sm">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="text-sm">
                                <div className="text-slate-500">Склад</div>
                                <div className="font-medium text-slate-900">{receipt.warehouse?.name ?? "—"}</div>
                            </div>
                            <div className="text-sm">
                                <div className="text-slate-500">Поставщик</div>
                                <div className="font-medium text-slate-900">{receipt.supplier_name || "—"}</div>
                            </div>
                            <div className="text-sm">
                                <div className="text-slate-500">Дата прихода</div>
                                <div className="font-medium text-slate-900">{formatDate(receipt.received_at)}</div>
                            </div>
                            <div className="text-sm">
                                <div className="text-slate-500">Комментарий</div>
                                <div className="font-medium text-slate-900">{receipt.comment || "—"}</div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-admin-border bg-admin-surface shadow-admin-card shadow-sm">
                        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
                            Строки документа
                        </div>
                        <div className="p-3 sm:p-4">
                            {(receipt.items ?? []).length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                                    Строк в документе нет.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {(receipt.items ?? []).map((item) => (
                                        <div
                                            key={item.id}
                                            className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 md:flex-row md:items-center md:justify-between"
                                        >
                                            <div className="min-w-0">
                                                <span className="font-medium">{item.supplier_sku || "Без кода"}</span>
                                                <span className="mx-2 text-slate-300">-</span>
                                                <span>{item.product_name}</span>
                                                <span className="mx-2 text-slate-300">/</span>
                                                <span>{item.variant_title}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm">
                                                <span>{item.qty} шт.</span>
                                                <span>{item.supplier_price}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
        </AdminPageCard>
    );
}


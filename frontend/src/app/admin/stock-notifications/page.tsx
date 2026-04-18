"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    fetchAdminStockNotifications,
    updateAdminStockNotificationStatus,
    type StockNotificationRequestData,
    type CustomerRequestKind,
} from "@/lib/stock-notifications-api";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminFilterSelect from "@/components/admin/ui/admin-filter-select";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import CopyText from "@/components/ui/copy-text";
import useDebouncedValue from "@/hooks/use-debounced-value";
import type { AdminToast } from "@/types/admin";

const STATUS_OPTIONS: { value: "new" | "notified" | "cancelled"; label: string }[] = [
    { value: "new", label: "Новый" },
    { value: "notified", label: "Обработан" },
    { value: "cancelled", label: "Отменён" },
];

const STATUS_LABEL: Record<string, string> = STATUS_OPTIONS.reduce(
    (acc, item) => ({ ...acc, [item.value]: item.label }),
    {},
);

const KIND_OPTIONS: { value: CustomerRequestKind; label: string }[] = [
    { value: "back_in_stock", label: "Сообщить о появлении" },
    { value: "callback", label: "Заказать звонок" },
];

const KIND_LABEL: Record<string, string> = KIND_OPTIONS.reduce(
    (acc, item) => ({ ...acc, [item.value]: item.label }),
    {},
);

const KIND_BADGE_CLASS: Record<string, string> = {
    back_in_stock: "bg-amber-50 text-amber-800 border border-amber-200",
    callback: "bg-emerald-50 text-emerald-800 border border-emerald-200",
};

function formatDate(iso: string | null): string {
    if (!iso) return "—";
    try {
        const date = new Date(iso);
        return date.toLocaleString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

export default function AdminStockNotificationsPage() {
    const searchParams = useSearchParams();
    const kindFromUrl = searchParams.get("kind") || "";

    const [items, setItems] = useState<StockNotificationRequestData[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<number | null>(null);
    const [toast, setToast] = useState<AdminToast | null>(null);

    const [searchInput, setSearchInput] = useState(
        () => searchParams.get("search") ?? "",
    );
    const [statusFilter, setStatusFilter] = useState("");
    const [kindFilter, setKindFilter] = useState<string>(kindFromUrl);

    useEffect(() => {
        setKindFilter(kindFromUrl);
    }, [kindFromUrl]);

    const debouncedSearch = useDebouncedValue(searchInput, 400);

    const pageTitle = useMemo(() => {
        if (kindFilter === "callback") return "Заказы звонков";
        if (kindFilter === "back_in_stock") return "Запросы на поступление";
        return "Запросы клиентов";
    }, [kindFilter]);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetchAdminStockNotifications({
                search: debouncedSearch,
                status: statusFilter,
                kind: kindFilter,
            });
            setItems(response.data);
        } catch (error) {
            console.error(error);
            setToast({ type: "error", message: "Не удалось загрузить запросы" });
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, statusFilter, kindFilter]);

    useEffect(() => {
        void load();
    }, [load]);

    const handleStatusChange = async (id: number, status: "new" | "notified" | "cancelled") => {
        try {
            setSavingId(id);
            const response = await updateAdminStockNotificationStatus(id, status);
            setItems((prev) =>
                prev.map((item) => (item.id === id ? response.data : item)),
            );
            setToast({ type: "success", message: "Статус обновлён" });
        } catch (error) {
            console.error(error);
            setToast({ type: "error", message: "Не удалось обновить статус" });
        } finally {
            setSavingId(null);
        }
    };

    const handleReset = () => {
        setSearchInput("");
        setStatusFilter("");
        setKindFilter("");
    };

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title={pageTitle}
                description="Обращения клиентов: «Сообщить о появлении» и «Заказать звонок». Свяжитесь с клиентом и переведите запрос в статус «Обработан»."
            >
                <AdminSearchInput
                    value={searchInput}
                    onChangeAction={setSearchInput}
                    placeholder="ID, телефон, товар"
                />

                <AdminFilterSelect
                    value={kindFilter}
                    onChangeAction={setKindFilter}
                    label="Тип"
                    options={KIND_OPTIONS}
                    placeholder="Все типы"
                />

                <AdminFilterSelect
                    value={statusFilter}
                    onChangeAction={setStatusFilter}
                    label="Статус"
                    options={STATUS_OPTIONS}
                    placeholder="Все статусы"
                />

                <button
                    type="button"
                    onClick={handleReset}
                    className="rounded-xl border px-4 py-2 text-sm"
                >
                    Сбросить
                </button>
            </AdminTableToolbar>

            {loading && <AdminLoadingState text="Загрузка запросов..." />}

            {!loading && items.length === 0 && (
                <AdminEmptyState
                    title="Запросов пока нет"
                    description="Когда клиенты будут оставлять заявки «Сообщить о появлении», они появятся здесь."
                />
            )}

            {!loading && items.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b text-left text-gray-500">
                                <th className="px-4 py-3">#</th>
                                <th className="px-4 py-3">Дата</th>
                                <th className="px-4 py-3">Тип</th>
                                <th className="px-4 py-3">Товар</th>
                                <th className="px-4 py-3">Вариант</th>
                                <th className="px-4 py-3">Телефон</th>
                                <th className="px-4 py-3">Комментарий</th>
                                <th className="px-4 py-3">Статус</th>
                            </tr>
                        </thead>
                        <tbody className="align-top">
                            {items.map((item) => {
                                const productHref =
                                    item.product?.slug != null
                                        ? `/product/${item.product.slug}`
                                        : null;

                                return (
                                    <tr key={item.id} className="border-b last:border-b-0">
                                        <td className="px-4 py-3 font-medium">
                                            <CopyText
                                                value={String(item.id)}
                                                label={`#${item.id}`}
                                                title="Скопировать номер запроса"
                                            />
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                                            {formatDate(item.created_at)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                                    KIND_BADGE_CLASS[item.kind] ??
                                                    "bg-gray-50 text-gray-700 border border-gray-200"
                                                }`}
                                            >
                                                {KIND_LABEL[item.kind] ?? item.kind}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium">
                                                {productHref ? (
                                                    <Link
                                                        href={productHref}
                                                        target="_blank"
                                                        className="hover:underline"
                                                    >
                                                        {item.product_name || "—"}
                                                    </Link>
                                                ) : (
                                                    item.product_name || "—"
                                                )}
                                            </div>
                                            {item.product_id && (
                                                <div className="mt-0.5 text-xs text-gray-400">
                                                    ID: {item.product_id}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">
                                            {item.variant_title || "—"}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-800">
                                            <CopyText
                                                value={item.phone}
                                                label={item.phone}
                                                title="Скопировать номер"
                                                iconSize={12}
                                            />
                                        </td>
                                        <td className="max-w-xs px-4 py-3 text-gray-700">
                                            {item.comment ? (
                                                <div className="whitespace-pre-line break-words text-sm">
                                                    {item.comment}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <select
                                                value={item.status}
                                                onChange={(e) =>
                                                    handleStatusChange(
                                                        item.id,
                                                        e.target.value as "new" | "notified" | "cancelled",
                                                    )
                                                }
                                                disabled={savingId === item.id}
                                                className="min-w-[160px] rounded-xl border px-3 py-2 text-sm focus:outline-none"
                                            >
                                                {STATUS_OPTIONS.map((option) => (
                                                    <option key={option.value} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                                {!STATUS_LABEL[item.status] && (
                                                    <option value={item.status}>{item.status}</option>
                                                )}
                                            </select>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {toast && (
                <AdminFeedbackMessage
                    type={toast.type}
                    message={toast.message}
                    onCloseAction={() => setToast(null)}
                />
            )}
        </AdminPageCard>
    );
}

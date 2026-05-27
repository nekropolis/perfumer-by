"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";
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
    { value: "back_in_stock", label: "Наличие" },
    { value: "callback", label: "Звонок" },
];

const KIND_LABEL: Record<string, string> = KIND_OPTIONS.reduce(
    (acc, item) => ({ ...acc, [item.value]: item.label }),
    {},
);

const KIND_BADGE_CLASS: Record<string, string> = {
    back_in_stock: "bg-amber-50 text-amber-800 border border-amber-200",
    callback: "bg-emerald-50 text-emerald-800 border border-emerald-200",
};
const STATUS_DROPDOWN_WIDTH_CLASS = "w-[124px]";
const STATUS_DROPDOWN_MENU_WIDTH_CLASS = "w-[188px]";

function splitDateTimeForTable(iso: string | null): { date: string; time: string } | null {
    if (!iso) return null;
    try {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) {
            return null;
        }
        const datePart = date.toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
        });
        const timePart = date.toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
        });
        return { date: datePart, time: timePart };
    } catch {
        return null;
    }
}

export default function AdminStockNotificationsPage() {
    const searchParams = useSearchParams();

    const [items, setItems] = useState<StockNotificationRequestData[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<number | null>(null);
    const [toast, setToast] = useState<AdminToast | null>(null);

    const [searchInput, setSearchInput] = useState(
        () => searchParams.get("search") ?? "",
    );
    const [statusFilter, setStatusFilter] = useState("");
    const [kindFilter, setKindFilter] = useState("");

    const debouncedSearch = useDebouncedValue(searchInput, 400);

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
                title="Запросы товаров"
                description="Заявки «Сообщить о появлении» и «Заказать звонок» в одном списке. Отфильтруйте по типу при необходимости. Свяжитесь с клиентом и переведите запрос в «Обработан»."
            >
                <AdminSearchInput
                    value={searchInput}
                    onChangeAction={setSearchInput}
                    placeholder="ID, телефон, товар"
                />

                <AdminFilterSelect
                    value={kindFilter}
                    onChangeAction={setKindFilter}
                    options={KIND_OPTIONS}
                    placeholder="Все типы"
                />

                <AdminFilterSelect
                    value={statusFilter}
                    onChangeAction={setStatusFilter}
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
                    description="Когда клиенты оставят заявку «Сообщить о появлении» или «Заказать звонок», она появится в этой таблице."
                />
            )}

            {!loading && items.length > 0 && (
                <div className="min-w-0 overflow-x-auto lg:overflow-x-visible">
                    <table className="w-full min-w-[680px] border-collapse text-left text-sm lg:min-w-0 lg:table-fixed">
                        {/*
                          Явные доли колонок + overflow-hidden в ячейках (кроме статуса),
                          иначе при table-fixed кнопки/бейджи визуально «наезжают» на соседние колонки.
                        */}
                        <colgroup>
                            <col style={{ width: "8%" }} />
                            <col style={{ width: "12%" }} />
                            <col style={{ width: "10%" }} />
                            <col style={{ width: "20%" }} />
                            <col style={{ width: "18%" }} />
                            <col style={{ width: "17%" }} />
                            <col style={{ width: "14%" }} />
                        </colgroup>
                        <thead>
                            <tr className="border-b text-left text-admin-text-secondary">
                                <th className="overflow-hidden px-2 py-2">#</th>
                                <th className="overflow-hidden px-2 py-2">Дата</th>
                                <th className="overflow-hidden px-2 py-2">Тип</th>
                                <th className="overflow-hidden px-2 py-2">Товар / вариант</th>
                                <th className="overflow-hidden px-2 py-2">Телефон</th>
                                <th className="overflow-hidden px-2 py-2">Комментарий</th>
                                <th className="px-2 py-2">Статус</th>
                            </tr>
                        </thead>
                        <tbody className="align-top">
                            {items.map((item) => {
                                const productHref =
                                    item.product?.slug != null
                                        ? `/product/${item.product.slug}`
                                        : null;
                                const kindFull = KIND_LABEL[item.kind] ?? item.kind;

                                const dateParts = splitDateTimeForTable(item.created_at);

                                return (
                                    <tr key={item.id} className="border-b last:border-b-0">
                                        <td className="max-w-0 overflow-hidden px-2 py-2 font-medium">
                                            <CopyText
                                                value={String(item.id)}
                                                label={`#${item.id}`}
                                                title="Скопировать номер запроса"
                                                className="max-w-full min-w-0"
                                            />
                                        </td>
                                        <td className="max-w-0 overflow-hidden px-2 py-2 leading-tight text-admin-text">
                                            {dateParts ? (
                                                <>
                                                    <div className="whitespace-nowrap text-xs tabular-nums lg:text-sm">
                                                        {dateParts.date}
                                                    </div>
                                                    <div className="mt-0.5 whitespace-nowrap text-[10px] tabular-nums text-admin-text-secondary lg:text-[11px]">
                                                        {dateParts.time}
                                                    </div>
                                                </>
                                            ) : (
                                                <span className="text-xs text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="max-w-0 min-w-0 overflow-hidden px-2 py-2">
                                            <span
                                                title={kindFull}
                                                className={`box-border block w-full max-w-full overflow-hidden rounded-full px-1.5 py-0.5 text-center text-[10px] font-medium leading-snug break-words line-clamp-2 ${KIND_BADGE_CLASS[item.kind] ??
                                                    "border border-admin-border bg-admin-muted text-admin-text"
                                                    }`}
                                            >
                                                {kindFull}
                                            </span>
                                        </td>
                                        <td className="max-w-0 min-w-0 overflow-hidden px-2 py-2">
                                            <div className="min-w-0 truncate font-medium">
                                                {productHref ? (
                                                    <Link
                                                        href={productHref}
                                                        target="_blank"
                                                        className="hover:underline"
                                                        title={item.product_name ?? undefined}
                                                    >
                                                        {item.product_name || "—"}
                                                    </Link>
                                                ) : (
                                                    <span title={item.product_name ?? undefined}>
                                                        {item.product_name || "—"}
                                                    </span>
                                                )}
                                            </div>
                                            {item.variant_title ? (
                                                <div
                                                    className="mt-0.5 truncate text-xs text-admin-text-secondary"
                                                    title={item.variant_title}
                                                >
                                                    {item.variant_title}
                                                </div>
                                            ) : (
                                                <div className="mt-0.5 text-xs text-gray-400">—</div>
                                            )}
                                            {item.product_id ? (
                                                <div className="mt-0.5 text-[11px] text-gray-400">
                                                    ID {item.product_id}
                                                </div>
                                            ) : null}
                                        </td>
                                        <td className="max-w-0 min-w-0 overflow-hidden px-2 py-2 font-mono text-[11px] text-admin-text lg:text-xs">
                                            <CopyText
                                                value={item.phone}
                                                label={item.phone}
                                                title="Скопировать номер"
                                                iconSize={12}
                                                className="flex w-full min-w-0 max-w-full justify-start overflow-hidden [&>span.tabular-nums]:min-w-0 [&>span.tabular-nums]:truncate"
                                            />
                                        </td>
                                        <td className="max-w-0 min-w-0 overflow-hidden px-2 py-2 text-admin-text">
                                            {item.comment ? (
                                                <div
                                                    className="line-clamp-3 whitespace-pre-line break-words text-xs lg:text-sm"
                                                    title={item.comment}
                                                >
                                                    {item.comment}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="min-w-0 overflow-visible px-2 py-2">
                                            <AdminStatusDropdown
                                                value={item.status}
                                                options={[
                                                    ...STATUS_OPTIONS,
                                                    ...(!STATUS_LABEL[item.status]
                                                        ? [{ value: item.status, label: item.status }]
                                                        : []),
                                                ]}
                                                onChangeAction={(nextStatus) =>
                                                    handleStatusChange(
                                                        item.id,
                                                        nextStatus as "new" | "notified" | "cancelled",
                                                    )
                                                }
                                                disabled={savingId === item.id}
                                                widthClassName={STATUS_DROPDOWN_WIDTH_CLASS}
                                                menuWidthClassName={STATUS_DROPDOWN_MENU_WIDTH_CLASS}
                                            />
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

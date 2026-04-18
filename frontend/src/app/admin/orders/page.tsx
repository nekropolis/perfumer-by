"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchOrders } from "@/lib/admin-orders-api";
import type { OrderData } from "@/types/orders";
import { ORDER_STATUS_OPTIONS } from "@/constants/order-statuses";
import AdminOrdersTable from "@/components/admin/admin-orders-table";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminFilterSelect from "@/components/admin/ui/admin-filter-select";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import useDebouncedValue from "@/hooks/use-debounced-value";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import {AdminToast} from "@/types/admin";

export default function AdminOrdersPage() {
    const searchParamsFromUrl = useSearchParams();

    const [orders, setOrders] = useState<OrderData[]>([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<AdminToast | null>(null);

    const [searchInput, setSearchInput] = useState(
        () => searchParamsFromUrl.get("search") ?? "",
    );
    const [statusFilter, setStatusFilter] = useState("");

    const debouncedSearch = useDebouncedValue(searchInput, 400);

    useEffect(() => {
        const loadOrders = async () => {
            try {
                setLoading(true);
                setToast(null);

                const response = await fetchOrders({
                    search: debouncedSearch,
                    status: statusFilter,
                });

                setOrders(response.data);
            } catch (error) {
                console.error(error);
                setToast({ type: "error", message: "Не удалось загрузить заказы" });
            } finally {
                setLoading(false);
            }
        };

        void loadOrders();
    }, [debouncedSearch, statusFilter]);

    const handleReset = () => {
        setSearchInput("");
        setStatusFilter("");
        setToast(null);
    };

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Заказы"
                description="Поиск по номеру заказа, имени клиента или телефону"
            >
                <AdminSearchInput
                    value={searchInput}
                    onChangeAction={setSearchInput}
                    placeholder="ID, имя, телефон"
                />

                <AdminFilterSelect
                    value={statusFilter}
                    onChangeAction={setStatusFilter}
                    label="Статус"
                    options={ORDER_STATUS_OPTIONS}
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

            {loading && <AdminLoadingState text="Загрузка заказов..." />}

            {!loading && orders.length === 0 && (
                <AdminEmptyState
                    title="Заказы не найдены"
                    description="Попробуйте изменить поиск или фильтр по статусу."
                />
            )}

            {!loading && orders.length > 0 && (
                <AdminOrdersTable
                    initialOrders={orders}
                    onSuccessMessageAction={(message) => setToast({ type: "success", message })}
                    onErrorMessageAction={(message) => setToast({ type: "error", message })}
                />
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
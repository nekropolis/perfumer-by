"use client";

import { useEffect, useState } from "react";
import { ListOrdered, ShoppingCart } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { fetchOrders } from "@/lib/admin-orders-api";
import { fetchProducts, type ProductAdminItem } from "@/lib/admin-products-api";
import { fetchSupplierOrderReservationsReport, type SupplierOrderReservationRow } from "@/lib/admin-warehouse-api";
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
import AdminRichTabs, { type AdminRichTabItem } from "@/components/admin/ui/admin-rich-tabs";
import {AdminToast} from "@/types/admin";

type OrdersTab = "orders" | "order_products";

const ORDER_TABS: AdminRichTabItem<OrdersTab>[] = [
    {
        id: "orders",
        label: "Заказы",
        description: "Список заказов и статусы",
        icon: ListOrdered,
    },
    {
        id: "order_products",
        label: "Товары для заказов",
        description: "Резервы новых заказов на складе поставщика",
        icon: ShoppingCart,
    },
];

export default function AdminOrdersPage() {
    const searchParamsFromUrl = useSearchParams();
    const [activeTab, setActiveTab] = useState<OrdersTab>("orders");

    const [orders, setOrders] = useState<OrderData[]>([]);
    const [orderProducts, setOrderProducts] = useState<SupplierOrderReservationRow[]>([]);
    const [products, setProducts] = useState<ProductAdminItem[]>([]);
    const [productFilter, setProductFilter] = useState<number | "">("");
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<AdminToast | null>(null);

    const [searchInput, setSearchInput] = useState(
        () => searchParamsFromUrl.get("search") ?? "",
    );
    const [statusFilter, setStatusFilter] = useState(
        () => searchParamsFromUrl.get("status") ?? "",
    );

    const debouncedSearch = useDebouncedValue(searchInput, 400);

    useEffect(() => {
        setStatusFilter(searchParamsFromUrl.get("status") ?? "");
    }, [searchParamsFromUrl]);

    useEffect(() => {
        if (activeTab !== "orders") {
            return;
        }

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
    }, [activeTab, debouncedSearch, statusFilter]);

    useEffect(() => {
        if (activeTab !== "order_products") {
            return;
        }

        const loadOrderProducts = async () => {
            try {
                setLoading(true);
                setToast(null);
                const response = await fetchSupplierOrderReservationsReport({
                    page: 1,
                    product_id: typeof productFilter === "number" ? productFilter : undefined,
                });
                setOrderProducts(response.data ?? []);
            } catch (error) {
                console.error(error);
                setToast({ type: "error", message: "Не удалось загрузить товары для заказа" });
            } finally {
                setLoading(false);
            }
        };

        void loadOrderProducts();
    }, [activeTab, productFilter]);

    useEffect(() => {
        const loadProducts = async () => {
            try {
                const response = await fetchProducts({ page: 1 });
                setProducts(response.data ?? []);
            } catch (error) {
                console.error(error);
            }
        };
        void loadProducts();
    }, []);

    const handleReset = () => {
        setSearchInput("");
        setStatusFilter("");
        setProductFilter("");
        setToast(null);
    };

    return (
        <AdminPageCard>
            <AdminRichTabs
                items={ORDER_TABS}
                activeTab={activeTab}
                onChangeAction={setActiveTab}
                columnsClassName="grid gap-2 md:grid-cols-2"
            />

            <AdminTableToolbar
                title={activeTab === "orders" ? "Заказы" : "Товары для заказов"}
                description={
                    activeTab === "orders"
                        ? "Поиск по номеру заказа, имени клиента или телефону"
                        : "Резервы по новым заказам только для склада Поставщик"
                }
            >
                {activeTab === "orders" ? (
                    <>
                        <AdminSearchInput
                            value={searchInput}
                            onChangeAction={setSearchInput}
                            placeholder="ID, имя, телефон"
                        />

                        <AdminFilterSelect
                            value={statusFilter}
                            onChangeAction={setStatusFilter}
                            options={ORDER_STATUS_OPTIONS}
                            placeholder="Все статусы"
                        />
                    </>
                ) : (
                    <select
                        value={productFilter}
                        onChange={(e) => setProductFilter(e.target.value ? Number(e.target.value) : "")}
                        className="rounded-xl border px-3 py-2 text-sm"
                    >
                        <option value="">Все товары</option>
                        {products.map((product) => (
                            <option key={product.id} value={product.id}>
                                {product.name}
                            </option>
                        ))}
                    </select>
                )}

                <button
                    type="button"
                    onClick={handleReset}
                    className="rounded-xl border px-4 py-2 text-sm"
                >
                    Сбросить
                </button>
            </AdminTableToolbar>

            {loading && <AdminLoadingState text="Загрузка заказов..." />}

            {!loading && activeTab === "orders" && orders.length === 0 && (
                <AdminEmptyState
                    title="Заказы не найдены"
                    description="Попробуйте изменить поиск или фильтр по статусу."
                />
            )}

            {!loading && activeTab === "orders" && orders.length > 0 && (
                <AdminOrdersTable
                    initialOrders={orders}
                    onSuccessMessageAction={(message) => setToast({ type: "success", message })}
                    onErrorMessageAction={(message) => setToast({ type: "error", message })}
                />
            )}

            {!loading && activeTab === "order_products" && orderProducts.length === 0 && (
                <AdminEmptyState
                    title="Товаров для заказа нет"
                    description="Нет активных резервов по новым заказам на складе поставщика."
                />
            )}

            {!loading && activeTab === "order_products" && orderProducts.length > 0 && (
                <div className="overflow-x-auto rounded-2xl border">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b text-left text-gray-500">
                                <th className="px-4 py-3">Заказ</th>
                                <th className="px-4 py-3">Товар</th>
                                <th className="px-4 py-3">Поставщик</th>
                                <th className="px-4 py-3">Название у поставщика</th>
                                <th className="px-4 py-3">Код поставщика</th>
                                <th className="px-4 py-3">Цена поставщика</th>
                                <th className="px-4 py-3">Кол-во</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orderProducts.map((row) => (
                                <tr key={row.reservation_id} className="border-b last:border-b-0">
                                    <td className="px-4 py-3 font-medium">#{row.order_id}</td>
                                    <td className="px-4 py-3">
                                        <div>{row.product_name ?? "—"}</div>
                                        <div className="text-xs text-gray-500">{row.variant_title ?? "—"}</div>
                                    </td>
                                    <td className="px-4 py-3">{row.supplier_name ?? "—"}</td>
                                    <td className="px-4 py-3">{row.supplier_product_name ?? "—"}</td>
                                    <td className="px-4 py-3">{row.supplier_code ?? "—"}</td>
                                    <td className="px-4 py-3">{row.supplier_price ?? "—"}</td>
                                    <td className="px-4 py-3">{row.qty}</td>
                                </tr>
                            ))}
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
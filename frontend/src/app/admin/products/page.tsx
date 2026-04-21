"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminFilterSelect from "@/components/admin/ui/admin-filter-select";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import AdminTableShell from "@/components/admin/ui/admin-table-shell";
import ProductsTable from "@/components/admin/products/products-table";
import ProductCatalogTabs from "@/components/admin/products/product-catalog-tabs";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import { PRODUCT_STATUS_FILTER_OPTIONS } from "@/lib/product-statuses";
import {
    deleteProduct,
    fetchProductVariantSuppliers,
    fetchProducts,
    type ProductAdminItem,
    type ProductVariantSupplierItem,
    type ProductsAdminResponse,
} from "@/lib/admin-products-api";

function formatSitePrice(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === "") {
        return "—";
    }
    return `${value} BYN`;
}

export default function AdminProductsPage() {
    const STOCK_FILTER_OPTIONS = [
        { value: "1", label: "Нет в наличии" },
        { value: "0", label: "В наличии" },
    ];
    const searchParamsFromUrl = useSearchParams();

    const [items, setItems] = useState<ProductAdminItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [searchInput, setSearchInput] = useState(
        () => searchParamsFromUrl.get("search") ?? "",
    );
    const [outOfStockFilter, setOutOfStockFilter] = useState<"" | "1" | "0">("");
    const [statusFilter, setStatusFilter] = useState<"" | "new" | "hit" | "discount">("");
    const [page, setPage] = useUrlPage();
    const [meta, setMeta] = useState<ProductsAdminResponse | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<ProductAdminItem | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [variantsTarget, setVariantsTarget] = useState<ProductAdminItem | null>(null);
    const [variantSuppliers, setVariantSuppliers] = useState<ProductVariantSupplierItem[]>([]);
    const [variantsLoading, setVariantsLoading] = useState(false);

    const debouncedSearch = useDebouncedValue(searchInput, 400);

    const loadItems = useCallback(async (
        targetPage: number,
        targetSearch: string,
        targetOutOfStock: "" | "1" | "0",
        targetStatus: "" | "new" | "hit" | "discount",
    ) => {
        setLoading(true);
        setError("");

        try {
            const data = await fetchProducts({
                page: targetPage,
                search: targetSearch.trim() || undefined,
                out_of_stock: targetOutOfStock,
                status: targetStatus,
            });

            setItems(data.data || []);
            setMeta(data);
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message : "Ошибка загрузки продуктов");
        } finally {
            setLoading(false);
        }
    }, []);

    useResetPageOnChange(setPage, [debouncedSearch, outOfStockFilter, statusFilter]);

    useEffect(() => {
        void loadItems(page, debouncedSearch, outOfStockFilter, statusFilter);
    }, [loadItems, page, outOfStockFilter, statusFilter, debouncedSearch]);

    const requestDelete = (item: ProductAdminItem) => {
        setDeleteTarget(item);
    };

    const openVariantsModal = async (item: ProductAdminItem) => {
        setVariantsTarget(item);
        setVariantSuppliers([]);
        setVariantsLoading(true);
        setError("");
        try {
            const data = await fetchProductVariantSuppliers(item.id);
            setVariantSuppliers(data.data || []);
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message : "Ошибка загрузки вариантов и поставщиков");
        } finally {
            setVariantsLoading(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) {
            return;
        }

        setDeleting(true);
        setError("");
        setSuccess("");

        try {
            const data = await deleteProduct(deleteTarget.id);
            setSuccess(data.message || "Продукт удалён");
            setDeleteTarget(null);
            await loadItems(page, debouncedSearch, outOfStockFilter, statusFilter);
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message : "Ошибка удаления продукта");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Продукты"
                description="Просмотр, создание, редактирование и удаление продуктов"
                action={
                    <Link
                        href="/admin/products/create"
                        className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
                    >
                        Создать продукт
                    </Link>
                }
            >
            </AdminTableToolbar>
            <ProductCatalogTabs />

            {error ? (
                <AdminFeedbackMessage
                    type="error"
                    message={error}
                    onCloseAction={() => setError("")}
                />
            ) : null}

            {success ? (
                <AdminFeedbackMessage
                    type="success"
                    message={success}
                    onCloseAction={() => setSuccess("")}
                />
            ) : null}

            <AdminTableShell
                total={meta?.total ?? items.length}
                search={
                    <div className="flex flex-col gap-2 md:flex-row md:items-end">
                        <AdminSearchInput
                            value={searchInput}
                            onChangeAction={setSearchInput}
                            placeholder="Поиск по названию или slug"
                        />
                        <AdminFilterSelect
                            value={outOfStockFilter}
                            onChangeAction={(value) => setOutOfStockFilter(value as "" | "1" | "0")}
                            options={STOCK_FILTER_OPTIONS}
                            placeholder="Все товары"
                            className="min-w-[220px] md:min-w-[180px]"
                        />
                        <AdminFilterSelect
                            value={statusFilter}
                            onChangeAction={(value) => setStatusFilter(value as "" | "new" | "hit" | "discount")}
                            options={[...PRODUCT_STATUS_FILTER_OPTIONS]}
                            placeholder="Все статусы"
                            className="min-w-[220px] md:min-w-[200px]"
                        />
                    </div>
                }
                footer={
                    <AdminPagination
                        currentPage={meta?.current_page ?? 1}
                        lastPage={meta?.last_page ?? 1}
                        onPrevAction={() => setPage((p) => Math.max(1, p - 1))}
                        onNextAction={() =>
                            setPage((p) =>
                                meta && meta.current_page < meta.last_page ? p + 1 : p
                            )
                        }
                    />
                }
            >
                {loading && items.length === 0 ? (
                    <AdminLoadingState text="Загрузка продуктов..." />
                ) : items.length === 0 ? (
                    <AdminEmptyState
                        title="Продукты не найдены"
                        description="Попробуйте изменить поиск или создайте новый продукт."
                    />
                ) : (
                    <ProductsTable
                        items={items}
                        onDeleteAction={requestDelete}
                        onVariantsAction={(item) => void openVariantsModal(item)}
                    />
                )}
            </AdminTableShell>

            <AdminConfirmDialog
                open={!!deleteTarget}
                title="Удаление продукта"
                message={deleteTarget ? `Удалить продукт "${deleteTarget.name}"?` : ""}
                confirmText="Удалить"
                loading={deleting}
                onCloseAction={() => setDeleteTarget(null)}
                onConfirmAction={confirmDelete}
            />

            {variantsTarget ? (
                <div className="fixed inset-0 z-[200] bg-black/50 px-3 py-4 sm:px-6">
                    <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center">
                        <div className="flex max-h-full w-full flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
                            <div className="flex items-start justify-between border-b px-4 py-3 sm:px-5">
                                <div className="min-w-0">
                                    <h2 className="truncate text-sm font-semibold sm:text-base">
                                        Продукт: {variantsTarget.name}
                                    </h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setVariantsTarget(null)}
                                    className="ml-3 rounded-lg border px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
                                >
                                    Закрыть
                                </button>
                            </div>

                            <div className="overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
                                {variantsLoading ? (
                                    <div className="rounded-xl border px-3 py-4 text-sm text-gray-500">
                                        Загрузка вариантов...
                                    </div>
                                ) : variantSuppliers.length === 0 ? (
                                    <div className="rounded-xl border px-3 py-4 text-sm text-gray-500">
                                        В наличии нет вариантов или нет связок с поставщиками.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {variantSuppliers.map((variant) => (
                                            <div key={variant.id} className="rounded-xl border p-3">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {variant.title || `Вариант #${variant.id}`}
                                                    </div>
                                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                                                        Остаток: {variant.stock}
                                                    </span>
                                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                                                        {formatSitePrice(variant.site_price)}
                                                    </span>
                                                </div>

                                                <div className="mt-2 overflow-x-auto">
                                                    <table className="min-w-full text-xs">
                                                        <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                                                            <tr>
                                                                <th className="px-2.5 py-2">Поставщик</th>
                                                                <th className="px-2.5 py-2">Код</th>
                                                                <th className="px-2.5 py-2">Название у поставщика</th>
                                                                <th className="px-2.5 py-2">Закуп. цена</th>
                                                                <th className="px-2.5 py-2">Склад</th>
                                                                <th className="px-2.5 py-2">Кол-во</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {(() => {
                                                                if (variant.suppliers.length > 0) {
                                                                    return variant.suppliers.map((supplier) => (
                                                                        <tr key={supplier.offer_id} className="border-t">
                                                                            <td className="px-2.5 py-2">{supplier.supplier_name || "—"}</td>
                                                                            <td className="px-2.5 py-2">{supplier.supplier_code || "—"}</td>
                                                                            <td className="px-2.5 py-2">{supplier.supplier_product_name || "—"}</td>
                                                                            <td className="px-2.5 py-2">{supplier.supplier_price ?? "—"}</td>
                                                                            <td className="px-2.5 py-2">
                                                                                {variant.warehouses.length > 0
                                                                                    ? variant.warehouses.map((warehouse) => warehouse.warehouse_name || "—").join(", ")
                                                                                    : "—"}
                                                                            </td>
                                                                            <td className="px-2.5 py-2">
                                                                                {variant.warehouses.length > 0
                                                                                    ? variant.warehouses.map((warehouse) => `${warehouse.stock} шт.`).join(", ")
                                                                                    : "—"}
                                                                            </td>
                                                                        </tr>
                                                                    ));
                                                                }

                                                                if (variant.receipt_batches.length > 0) {
                                                                    return variant.receipt_batches.map((batch) => (
                                                                        <tr key={`receipt-batch-${batch.receipt_item_id}`} className="border-t">
                                                                            <td className="px-2.5 py-2">{batch.supplier_name || "Магазин"}</td>
                                                                            <td className="px-2.5 py-2">
                                                                                {batch.supplier_code || (batch.receipt_document_no ? `#${batch.receipt_document_no}` : `#${batch.receipt_id}`)}
                                                                            </td>
                                                                            <td className="px-2.5 py-2">{batch.supplier_product_name || "—"}</td>
                                                                            <td className="px-2.5 py-2">{batch.supplier_price ?? "—"}</td>
                                                                            <td className="px-2.5 py-2">{batch.warehouse_name || "—"}</td>
                                                                            <td className="px-2.5 py-2">{batch.qty} шт.</td>
                                                                        </tr>
                                                                    ));
                                                                }

                                                                if (variant.warehouses.length > 0) {
                                                                    return variant.warehouses.map((warehouse, idx) => (
                                                                        <tr key={`warehouse-only-${variant.id}-${idx}`} className="border-t">
                                                                            <td className="px-2.5 py-2 text-gray-500">Магазин</td>
                                                                            <td className="px-2.5 py-2 text-gray-500">—</td>
                                                                            <td className="px-2.5 py-2 text-gray-500">Складской остаток</td>
                                                                            <td className="px-2.5 py-2 text-gray-500">—</td>
                                                                            <td className="px-2.5 py-2">{warehouse.warehouse_name || "—"}</td>
                                                                            <td className="px-2.5 py-2">{warehouse.stock} шт.</td>
                                                                        </tr>
                                                                    ));
                                                                }

                                                                return (
                                                                    <tr className="border-t">
                                                                        <td colSpan={6} className="px-2.5 py-3 text-gray-500">
                                                                            Для этого варианта нет активных привязок.
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })()}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                    </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </AdminPageCard>
    );
}

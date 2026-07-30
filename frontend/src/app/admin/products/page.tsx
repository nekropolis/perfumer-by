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
import ProductVariantSuppliersModal from "@/components/admin/products/product-variant-suppliers-modal";
import ProductCatalogTabs from "@/components/admin/products/product-catalog-tabs";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import {
    fetchProductVariants,
    updateProductVariant,
} from "@/lib/admin-product-variants-api";
import { PRODUCT_STATUS_FILTER_OPTIONS } from "@/lib/product-statuses";
import {
    deleteProduct,
    fetchProductVariantSuppliers,
    fetchProducts,
    type ProductAdminItem,
    type ProductVariantSupplierItem,
    type ProductsAdminResponse,
} from "@/lib/admin-products-api";

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
    const [variantPriceDrafts, setVariantPriceDrafts] = useState<Record<number, string>>({});
    const [variantPriceSavingId, setVariantPriceSavingId] = useState<number | null>(null);
    const [variantOldPriceDrafts, setVariantOldPriceDrafts] = useState<Record<number, string>>({});
    const [variantOldPriceSavingId, setVariantOldPriceSavingId] = useState<number | null>(null);

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
        setVariantPriceDrafts({});
        setVariantPriceSavingId(null);
        setVariantOldPriceDrafts({});
        setVariantOldPriceSavingId(null);
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

    const getVariantPriceInputValue = (variant: ProductVariantSupplierItem): string => {
        const draft = variantPriceDrafts[variant.id];
        if (draft !== undefined) {
            return draft;
        }

        if (variant.site_price === null || variant.site_price === undefined || variant.site_price === "") {
            return "";
        }

        return String(variant.site_price);
    };

    const getVariantOldPriceInputValue = (variant: ProductVariantSupplierItem): string => {
        const draft = variantOldPriceDrafts[variant.id];
        if (draft !== undefined) {
            return draft;
        }

        if (variant.old_price === null || variant.old_price === undefined || variant.old_price === "") {
            return "";
        }

        return String(variant.old_price);
    };

    const normalizeMoneyInput = (value: string): string => value.trim().replace(",", ".");

    const moneyFieldOriginal = (
        value: ProductVariantSupplierItem["site_price"] | ProductVariantSupplierItem["old_price"],
    ): string => {
        if (value === null || value === undefined || value === "") {
            return "";
        }

        return String(value).trim();
    };

    const saveVariantSitePriceOnBlur = async (variant: ProductVariantSupplierItem) => {
        if (!variantsTarget) {
            return;
        }

        const normalizedCurrent = normalizeMoneyInput(getVariantPriceInputValue(variant));
        const normalizedOriginal = normalizeMoneyInput(moneyFieldOriginal(variant.site_price));

        if (normalizedCurrent === normalizedOriginal) {
            setVariantPriceDrafts((prev) => {
                if (!(variant.id in prev)) {
                    return prev;
                }
                const next = { ...prev };
                delete next[variant.id];
                return next;
            });
            return;
        }

        if (normalizedCurrent !== "") {
            const numeric = Number(normalizedCurrent);
            if (!Number.isFinite(numeric) || numeric < 0) {
                setError("Цена должна быть числом больше или равным 0");
                setVariantPriceDrafts((prev) => ({
                    ...prev,
                    [variant.id]: moneyFieldOriginal(variant.site_price),
                }));
                return;
            }
        }

        setVariantPriceSavingId(variant.id);
        setError("");
        setSuccess("");
        try {
            const variantsResponse = await fetchProductVariants(variantsTarget.id);
            const actualVariant = variantsResponse.data.find((row) => row.id === variant.id);
            if (!actualVariant) {
                throw new Error("Вариант не найден для обновления");
            }

            await updateProductVariant(variantsTarget.id, variant.id, {
                variant_definition_id: actualVariant.variant_definition_id ?? undefined,
                price: normalizedCurrent === "" ? null : normalizedCurrent,
                old_price: actualVariant.old_price ?? null,
                stock: actualVariant.stock ?? 0,
                is_preorder: actualVariant.is_preorder ?? false,
                is_active: actualVariant.is_active ?? true,
                is_promotion: actualVariant.is_promotion ?? false,
                sort_order: actualVariant.sort_order ?? 0,
            });

            setVariantSuppliers((prev) =>
                prev.map((row) =>
                    row.id === variant.id
                        ? { ...row, site_price: normalizedCurrent === "" ? null : normalizedCurrent }
                        : row
                )
            );
            setVariantPriceDrafts((prev) => {
                if (!(variant.id in prev)) {
                    return prev;
                }
                const next = { ...prev };
                delete next[variant.id];
                return next;
            });
            setSuccess("Цена варианта обновлена");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка обновления цены варианта");
            setVariantPriceDrafts((prev) => ({
                ...prev,
                [variant.id]: moneyFieldOriginal(variant.site_price),
            }));
        } finally {
            setVariantPriceSavingId((prev) => (prev === variant.id ? null : prev));
        }
    };

    const saveVariantOldPriceOnBlur = async (variant: ProductVariantSupplierItem) => {
        if (!variantsTarget) {
            return;
        }

        const normalizedCurrent = normalizeMoneyInput(getVariantOldPriceInputValue(variant));
        const normalizedOriginal = normalizeMoneyInput(moneyFieldOriginal(variant.old_price));

        if (normalizedCurrent === normalizedOriginal) {
            setVariantOldPriceDrafts((prev) => {
                if (!(variant.id in prev)) {
                    return prev;
                }
                const next = { ...prev };
                delete next[variant.id];
                return next;
            });
            return;
        }

        if (normalizedCurrent !== "") {
            const numeric = Number(normalizedCurrent);
            if (!Number.isFinite(numeric) || numeric < 0) {
                setError("Старая цена должна быть числом больше или равным 0");
                setVariantOldPriceDrafts((prev) => ({
                    ...prev,
                    [variant.id]: moneyFieldOriginal(variant.old_price),
                }));
                return;
            }
        }

        setVariantOldPriceSavingId(variant.id);
        setError("");
        setSuccess("");
        try {
            await updateProductVariant(variantsTarget.id, variant.id, {
                old_price: normalizedCurrent === "" ? null : normalizedCurrent,
            });

            setVariantSuppliers((prev) =>
                prev.map((row) =>
                    row.id === variant.id
                        ? { ...row, old_price: normalizedCurrent === "" ? null : normalizedCurrent }
                        : row,
                ),
            );
            setVariantOldPriceDrafts((prev) => {
                if (!(variant.id in prev)) {
                    return prev;
                }
                const next = { ...prev };
                delete next[variant.id];
                return next;
            });
            setSuccess("Старая цена варианта обновлена");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка обновления старой цены варианта");
            setVariantOldPriceDrafts((prev) => ({
                ...prev,
                [variant.id]: moneyFieldOriginal(variant.old_price),
            }));
        } finally {
            setVariantOldPriceSavingId((prev) => (prev === variant.id ? null : prev));
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
                        className="inline-flex items-center justify-center rounded-lg bg-admin-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-admin-primary-hover"
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
                            placeholder="Поиск по названию, slug, ID товара или ID варианта"
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
                        searchQuery={searchInput}
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
                <ProductVariantSuppliersModal
                    open
                    layout="flat"
                    onCloseAction={() => setVariantsTarget(null)}
                    productId={variantsTarget.id}
                    productName={variantsTarget.name}
                    productBrandName={variantsTarget.brand?.name}
                    suppliers={variantSuppliers}
                    suppliersLoading={variantsLoading}
                    suppliersError={error}
                    flatTableOptions={{
                        productId: variantsTarget.id,
                        onPromotionUpdatedAction: (variantId, next) => {
                            setVariantSuppliers((prev) =>
                                prev.map((row) =>
                                    row.id === variantId ? { ...row, is_promotion: next } : row,
                                ),
                            );
                        },
                        onPromotionErrorAction: setError,
                        getVariantPriceInputValue: getVariantPriceInputValue,
                        onVariantPriceChange: (variantId, value) =>
                            setVariantPriceDrafts((prev) => ({
                                ...prev,
                                [variantId]: value,
                            })),
                        onVariantPriceBlur: (variant) => void saveVariantSitePriceOnBlur(variant),
                        variantPriceSavingId,
                        getVariantOldPriceInputValue: getVariantOldPriceInputValue,
                        onVariantOldPriceChange: (variantId, value) =>
                            setVariantOldPriceDrafts((prev) => ({
                                ...prev,
                                [variantId]: value,
                            })),
                        onVariantOldPriceBlur: (variant) => void saveVariantOldPriceOnBlur(variant),
                        variantOldPriceSavingId,
                    }}
                />
            ) : null}
        </AdminPageCard>
    );
}

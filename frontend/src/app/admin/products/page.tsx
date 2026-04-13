"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import ProductsTable from "@/components/admin/products/products-table";
import {
    deleteProduct,
    fetchProducts,
    type ProductAdminItem,
    type ProductsAdminResponse,
} from "@/lib/admin-products-api";

export default function AdminProductsPage() {
    const [items, setItems] = useState<ProductAdminItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState<ProductsAdminResponse | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<ProductAdminItem | null>(null);
    const [deleting, setDeleting] = useState(false);

    const loadItems = async (targetPage = page, targetSearch = searchInput) => {
        setLoading(true);
        setError("");

        try {
            const data = await fetchProducts({
                page: targetPage,
                search: targetSearch.trim() || undefined,
            });

            setItems(data.data || []);
            setMeta(data);
        } catch (e: any) {
            setError(e?.message || "Ошибка загрузки продуктов");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            void loadItems(1, searchInput);
            setPage(1);
        }, 400);

        return () => clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        void loadItems(page, searchInput);
    }, [page]);

    const requestDelete = (item: ProductAdminItem) => {
        setDeleteTarget(item);
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
            await loadItems(page, searchInput);
        } catch (e: any) {
            setError(e?.message || "Ошибка удаления продукта");
        } finally {
            setDeleting(false);
        }
    };
    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Продукты"
                description="Просмотр, создание, редактирование и удаление продуктов"
            >
                <AdminSearchInput
                    value={searchInput}
                    onChange={setSearchInput}
                    placeholder="Поиск по названию или slug"
                />

                <Link
                    href="/admin/products/create"
                    className="rounded-xl bg-black px-4 py-2 text-sm text-white"
                >
                    Создать продукт
                </Link>
            </AdminTableToolbar>

            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage
                        type="error"
                        message={error}
                        onCloseAction={() => setError("")}
                    />
                </div>
            ) : null}

            {success ? (
                <div className="mb-4">
                    <AdminFeedbackMessage
                        type="success"
                        message={success}
                        onCloseAction={() => setSuccess("")}
                    />
                </div>
            ) : null}

            {loading ? (
                <AdminLoadingState text="Загрузка продуктов..." />
            ) : items.length === 0 ? (
                <AdminEmptyState
                    title="Продукты не найдены"
                    description="Попробуйте изменить поиск или создайте новый продукт."
                />
            ) : (
                <div className="space-y-4">
                    <div className="text-sm text-gray-500">
                        Всего: {meta?.total ?? items.length}
                    </div>

                    <ProductsTable
                        items={items}
                        onDelete={requestDelete}
                    />

                    <AdminPagination
                        currentPage={meta?.current_page ?? 1}
                        lastPage={meta?.last_page ?? 1}
                        onPrev={() => setPage((p) => Math.max(1, p - 1))}
                        onNext={() =>
                            setPage((p) =>
                                meta && meta.current_page < meta.last_page ? p + 1 : p
                            )
                        }
                    />
                </div>
            )}

            <AdminConfirmDialog
                open={!!deleteTarget}
                title="Удаление продукта"
                message={
                    deleteTarget
                        ? `Удалить продукт "${deleteTarget.name}"?`
                        : ""
                }
                confirmText="Удалить"
                loading={deleting}
                onClose={() => setDeleteTarget(null)}
                onConfirm={confirmDelete}
            />
        </AdminPageCard>
    );
}

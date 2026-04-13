"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminFilterSelect from "@/components/admin/ui/admin-filter-select";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import AttributesTable from "@/components/admin/attributes/attributes-table";
import {
    deleteAttribute,
    fetchAttributes,
    type AttributeAdminItem,
    type AttributeType,
    type AttributesAdminResponse,
} from "@/lib/admin-attributes-api";

export default function AdminAttributesPage() {
    const [items, setItems] = useState<AttributeAdminItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const [searchInput, setSearchInput] = useState("");
    const [typeFilter, setTypeFilter] = useState<AttributeType | "">("");
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState<AttributesAdminResponse | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<AttributeAdminItem | null>(null);
    const [deleting, setDeleting] = useState(false);

    const loadItems = async (
        targetPage = page,
        targetSearch = searchInput,
        targetType = typeFilter
    ) => {
        setLoading(true);
        setError("");

        try {
            const data = await fetchAttributes({
                page: targetPage,
                search: targetSearch.trim() || undefined,
                type: targetType || undefined,
            });

            setItems(data.data || []);
            setMeta(data);
        } catch (e: any) {
            setError(e?.message || "Ошибка загрузки характеристик");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1);
            void loadItems(1, searchInput, typeFilter);
        }, 400);

        return () => clearTimeout(timer);
    }, [searchInput, typeFilter]);

    useEffect(() => {
        void loadItems(page, searchInput, typeFilter);
    }, [page]);

    const confirmDelete = async () => {
        if (!deleteTarget) {
            return;
        }

        setDeleting(true);
        setError("");
        setSuccess("");

        try {
            const data = await deleteAttribute(deleteTarget.id);
            setSuccess(data.message || "Характеристика удалена");
            setDeleteTarget(null);
            await loadItems(page, searchInput, typeFilter);
        } catch (e: any) {
            setError(e?.message || "Ошибка удаления характеристики");
        } finally {
            setDeleting(false);
        }
    };
    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Характеристики"
                description="Справочник характеристик каталога"
            >
                <AdminSearchInput
                    value={searchInput}
                    onChange={setSearchInput}
                    placeholder="Поиск по названию или slug"
                />

                <AdminFilterSelect
                    value={typeFilter}
                    onChange={(value) => setTypeFilter(value as AttributeType | "")}
                    options={[
                        { value: "", label: "Все типы" },
                        { value: "text", label: "Текст" },
                        { value: "select", label: "Один из списка" },
                        { value: "multiselect", label: "Несколько из списка" },
                    ]}
                />

                <Link
                    href="/admin/attributes/create"
                    className="rounded-xl bg-black px-4 py-2 text-sm text-white"
                >
                    Создать характеристику
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
                <AdminLoadingState text="Загрузка характеристик..." />
            ) : items.length === 0 ? (
                <AdminEmptyState
                    title="Характеристики не найдены"
                    description="Попробуйте изменить фильтры или создайте новую характеристику."
                />
            ) : (
                <div className="space-y-4">
                    <div className="text-sm text-gray-500">
                        Всего: {meta?.total ?? items.length}
                    </div>

                    <AttributesTable
                        items={items}
                        onDelete={setDeleteTarget}
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
                title="Удаление характеристики"
                message={
                    deleteTarget
                        ? `Удалить характеристику "${deleteTarget.name}"?`
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

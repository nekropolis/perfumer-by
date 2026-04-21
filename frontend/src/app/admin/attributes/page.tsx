"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import AdminTableShell from "@/components/admin/ui/admin-table-shell";
import AttributesTable from "@/components/admin/attributes/attributes-table";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import {
    deleteAttribute,
    fetchAttributes,
    updateAttribute,
    type AttributeAdminItem,
    type AttributesAdminResponse,
} from "@/lib/admin-attributes-api";

export default function AdminAttributesPage() {
    const searchParamsFromUrl = useSearchParams();

    const [items, setItems] = useState<AttributeAdminItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const [searchInput, setSearchInput] = useState(
        () => searchParamsFromUrl.get("search") ?? "",
    );
    const [page, setPage] = useUrlPage();
    const [meta, setMeta] = useState<AttributesAdminResponse | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<AttributeAdminItem | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [pendingFilterIds, setPendingFilterIds] = useState<number[]>([]);

    const debouncedSearch = useDebouncedValue(searchInput, 400);

    const loadItems = useCallback(async (targetPage: number, targetSearch: string) => {
        setLoading(true);
        setError("");

        try {
            const data = await fetchAttributes({
                page: targetPage,
                search: targetSearch.trim() || undefined,
            });

            setItems(data.data || []);
            setMeta(data);
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message : "Ошибка загрузки атрибута");
        } finally {
            setLoading(false);
        }
    }, []);

    useResetPageOnChange(setPage, [debouncedSearch]);

    useEffect(() => {
        void loadItems(page, debouncedSearch);
    }, [loadItems, page, debouncedSearch]);

    const confirmDelete = async () => {
        if (!deleteTarget) {
            return;
        }

        setDeleting(true);
        setError("");
        setSuccess("");

        try {
            const data = await deleteAttribute(deleteTarget.id);
            setSuccess(data.message || "Атрибут удален");
            setDeleteTarget(null);
            await loadItems(page, debouncedSearch);
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Ошибка удаления атрибута"
            );
        } finally {
            setDeleting(false);
        }
    };

    const handleToggleFilter = async (item: AttributeAdminItem, nextValue: boolean) => {
        setError("");
        setSuccess("");
        setPendingFilterIds((prev) => [...prev, item.id]);

        try {
            const payload = {
                name: item.name,
                type: item.type,
                sort_order: item.sort_order,
                is_active: item.is_active,
                is_filterable: nextValue,
                filter_sort_order: item.filter_sort_order,
            };
            const result = await updateAttribute(item.id, payload);

            setItems((prev) =>
                prev.map((current) =>
                    current.id === item.id ? { ...current, is_filterable: nextValue } : current
                )
            );
            setSuccess(result.message || "Флаг фильтра обновлен");
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Ошибка обновления флага фильтра"
            );
        } finally {
            setPendingFilterIds((prev) => prev.filter((id) => id !== item.id));
        }
    };

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Атрибуты"
                description="Справочник атрибута каталога"
                action={
                    <Link
                        href="/admin/attributes/create"
                        className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
                    >
                        Создать атрибут
                    </Link>
                }
            >
            </AdminTableToolbar>

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

            {loading ? (
                <AdminLoadingState text="Загрузка атрибутов..." />
            ) : items.length === 0 ? (
                <AdminEmptyState
                    title="Атрибуты не найдены"
                    description="Попробуйте изменить фильтры или создайте новый атрибут."
                />
            ) : (
                <AdminTableShell
                    total={meta?.total ?? items.length}
                    search={
                        <AdminSearchInput
                            value={searchInput}
                            onChangeAction={setSearchInput}
                            placeholder="Поиск по названию или slug"
                        />
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
                    <AttributesTable
                        items={items}
                        onDeleteAction={setDeleteTarget}
                        onToggleFilterAction={handleToggleFilter}
                        pendingFilterIds={pendingFilterIds}
                    />
                </AdminTableShell>
            )}

            <AdminConfirmDialog
                open={!!deleteTarget}
                title="Удаление атрибута"
                message={
                    deleteTarget ? `Удалить атрибут "${deleteTarget.name}"?` : ""
                }
                confirmText="Удалить"
                loading={deleting}
                onCloseAction={() => setDeleteTarget(null)}
                onConfirmAction={confirmDelete}
            />
        </AdminPageCard>
    );
}

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
import BrandsTable from "@/components/admin/brands/brands-table";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import {
    deleteBrand,
    fetchBrands,
    syncBrandsFromVanilleJson,
    type BrandItem,
    type BrandsResponse,
} from "@/lib/admin-brands-api";

export default function AdminBrandsPage() {
    const searchParamsFromUrl = useSearchParams();

    const [items, setItems] = useState<BrandItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [searchInput, setSearchInput] = useState(
        () => searchParamsFromUrl.get("search") ?? "",
    );
    const [page, setPage] = useUrlPage();
    const [meta, setMeta] = useState<BrandsResponse | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<BrandItem | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const debouncedSearch = useDebouncedValue(searchInput, 400);

    const loadItems = useCallback(async (targetPage: number, targetSearch: string) => {
        setLoading(true);
        setError("");

        try {
            const data = await fetchBrands({
                page: targetPage,
                search: targetSearch.trim() || undefined,
            });

            setItems(data.data || []);
            setMeta(data);
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message : "Ошибка загрузки брендов");
        } finally {
            setLoading(false);
        }
    }, []);

    useResetPageOnChange(setPage, [debouncedSearch]);

    useEffect(() => {
        void loadItems(page, debouncedSearch);
    }, [loadItems, page, debouncedSearch]);

    const requestDelete = (item: BrandItem) => {
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
            const data = await deleteBrand(deleteTarget.id);
            setSuccess(data.message || "Бренд удалён");
            setDeleteTarget(null);
            await loadItems(page, debouncedSearch);
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message : "Ошибка удаления бренда");
        } finally {
            setDeleting(false);
        }
    };

    const syncFromVanille = async () => {
        setSyncing(true);
        setError("");
        setSuccess("");

        try {
            const data = await syncBrandsFromVanilleJson();
            setSuccess(`${data.message}. Добавлено: ${data.created}, пропущено: ${data.skipped}`);
            await loadItems(1, debouncedSearch);
            setPage(1);
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message : "Ошибка синхронизации брендов"
            );
        } finally {
            setSyncing(false);
        }
    };

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Бренды"
                description="Просмотр, создание, редактирование и удаление брендов"
                action={
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => void syncFromVanille()}
                            disabled={syncing}
                            className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {syncing ? "Добавляем..." : "Добавить новые бренды"}
                        </button>
                        <Link
                            href="/admin/brands/create"
                            className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
                        >
                            Создать бренд
                        </Link>
                    </div>
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
                {loading && items.length === 0 ? (
                    <AdminLoadingState text="Загрузка брендов..." />
                ) : items.length === 0 ? (
                    <AdminEmptyState
                        title="Бренды не найдены"
                        description="Попробуйте изменить поиск или создайте новый бренд."
                    />
                ) : (
                    <BrandsTable items={items} onDeleteAction={requestDelete} />
                )}
            </AdminTableShell>

            <AdminConfirmDialog
                open={!!deleteTarget}
                title="Удаление бренда"
                message={deleteTarget ? `Удалить бренд "${deleteTarget.name}"?` : ""}
                confirmText="Удалить"
                loading={deleting}
                onCloseAction={() => setDeleteTarget(null)}
                onConfirmAction={confirmDelete}
            />
        </AdminPageCard>
    );
}

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
import BlocksTable from "@/components/admin/blocks/blocks-table";
import ContentCatalogTabs from "@/components/admin/pages/content-catalog-tabs";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import { deleteAdminBlock, fetchAdminBlocks, type AdminBlockItem, type AdminBlocksResponse } from "@/lib/admin-blocks-api";

export default function AdminBlocksPage() {
    const searchParamsFromUrl = useSearchParams();
    const [items, setItems] = useState<AdminBlockItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [searchInput, setSearchInput] = useState(() => searchParamsFromUrl.get("search") ?? "");
    const [page, setPage] = useUrlPage();
    const [meta, setMeta] = useState<AdminBlocksResponse | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AdminBlockItem | null>(null);
    const [deleting, setDeleting] = useState(false);

    const debouncedSearch = useDebouncedValue(searchInput, 400);

    const loadItems = useCallback(async (targetPage: number, targetSearch: string) => {
        setLoading(true);
        setError("");
        try {
            const data = await fetchAdminBlocks({ page: targetPage, search: targetSearch.trim() || undefined });
            setItems(data.data || []);
            setMeta(data);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки блоков");
        } finally {
            setLoading(false);
        }
    }, []);

    useResetPageOnChange(setPage, [debouncedSearch]);

    useEffect(() => {
        void loadItems(page, debouncedSearch);
    }, [loadItems, page, debouncedSearch]);

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        setError("");
        setSuccess("");
        try {
            const data = await deleteAdminBlock(deleteTarget.id);
            setSuccess(data.message || "Блок удален");
            setDeleteTarget(null);
            await loadItems(page, debouncedSearch);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка удаления блока");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <AdminPageCard>
            <ContentCatalogTabs />

            <AdminTableToolbar
                title="Блоки на странице"
                description="Переиспользуемые CMS-блоки без отдельного URL"
                action={
                    <Link href="/admin/blocks/create" className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800">
                        Создать блок
                    </Link>
                }
            />

            {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}
            {success ? <AdminFeedbackMessage type="success" message={success} onCloseAction={() => setSuccess("")} /> : null}

            <AdminTableShell
                total={meta?.total ?? items.length}
                search={<AdminSearchInput value={searchInput} onChangeAction={setSearchInput} placeholder="Поиск по названию или коду" />}
                footer={
                    <AdminPagination
                        currentPage={meta?.current_page ?? 1}
                        lastPage={meta?.last_page ?? 1}
                        onPrevAction={() => setPage((p) => Math.max(1, p - 1))}
                        onNextAction={() => setPage((p) => (meta && meta.current_page < meta.last_page ? p + 1 : p))}
                    />
                }
            >
                {loading && items.length === 0 ? (
                    <AdminLoadingState text="Загрузка блоков..." />
                ) : items.length === 0 ? (
                    <AdminEmptyState title="Блоки не найдены" description="Создайте первый CMS-блок." />
                ) : (
                    <BlocksTable items={items} onDeleteAction={setDeleteTarget} />
                )}
            </AdminTableShell>

            <AdminConfirmDialog
                open={!!deleteTarget}
                title="Удаление блока"
                message={deleteTarget ? `Удалить блок "${deleteTarget.name}"?` : ""}
                confirmText="Удалить"
                loading={deleting}
                onCloseAction={() => setDeleteTarget(null)}
                onConfirmAction={confirmDelete}
            />
        </AdminPageCard>
    );
}

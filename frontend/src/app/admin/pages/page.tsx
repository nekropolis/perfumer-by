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
import PagesTable from "@/components/admin/pages/pages-table";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import { deleteAdminPage, fetchAdminPages, type AdminPageItem, type AdminPagesResponse } from "@/lib/admin-pages-api";

export default function AdminPagesPage() {
    const searchParamsFromUrl = useSearchParams();
    const [items, setItems] = useState<AdminPageItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [searchInput, setSearchInput] = useState(() => searchParamsFromUrl.get("search") ?? "");
    const [page, setPage] = useUrlPage();
    const [meta, setMeta] = useState<AdminPagesResponse | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AdminPageItem | null>(null);
    const [deleting, setDeleting] = useState(false);

    const debouncedSearch = useDebouncedValue(searchInput, 400);

    const loadItems = useCallback(async (targetPage: number, targetSearch: string) => {
        setLoading(true);
        setError("");
        try {
            const data = await fetchAdminPages({ page: targetPage, search: targetSearch.trim() || undefined });
            setItems(data.data || []);
            setMeta(data);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки страниц");
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
            const data = await deleteAdminPage(deleteTarget.id);
            setSuccess(data.message || "Страница удалена");
            setDeleteTarget(null);
            await loadItems(page, debouncedSearch);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка удаления страницы");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Страницы"
                description="CMS-страницы сайта"
                action={
                    <Link href="/admin/pages/create" className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800">
                        Создать страницу
                    </Link>
                }
            />

            {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}
            {success ? <AdminFeedbackMessage type="success" message={success} onCloseAction={() => setSuccess("")} /> : null}

            <AdminTableShell
                total={meta?.total ?? items.length}
                search={<AdminSearchInput value={searchInput} onChangeAction={setSearchInput} placeholder="Поиск по названию или slug" />}
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
                    <AdminLoadingState text="Загрузка страниц..." />
                ) : items.length === 0 ? (
                    <AdminEmptyState title="Страницы не найдены" description="Создайте первую CMS-страницу." />
                ) : (
                    <PagesTable items={items} onDeleteAction={setDeleteTarget} />
                )}
            </AdminTableShell>

            <AdminConfirmDialog
                open={!!deleteTarget}
                title="Удаление страницы"
                message={deleteTarget ? `Удалить страницу "${deleteTarget.name}"?` : ""}
                confirmText="Удалить"
                loading={deleting}
                onCloseAction={() => setDeleteTarget(null)}
                onConfirmAction={confirmDelete}
            />
        </AdminPageCard>
    );
}

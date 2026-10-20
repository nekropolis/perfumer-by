"use client";

import Link from "next/link";
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
import ContentCatalogTabs from "@/components/admin/pages/content-catalog-tabs";
import CatalogLandingsTable from "@/components/admin/catalog-landings/catalog-landings-table";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import {
    deleteAdminCatalogLanding,
    fetchAdminCatalogLandings,
    type AdminCatalogLandingItem,
    type AdminCatalogLandingsResponse,
} from "@/lib/admin-catalog-landings-api";

export default function AdminCatalogLandingsPage() {
    const [items, setItems] = useState<AdminCatalogLandingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [page, setPage] = useUrlPage();
    const [meta, setMeta] = useState<AdminCatalogLandingsResponse | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AdminCatalogLandingItem | null>(null);
    const [deleting, setDeleting] = useState(false);

    const debouncedSearch = useDebouncedValue(searchInput, 400);

    const loadItems = useCallback(async (targetPage: number, targetSearch: string) => {
        setLoading(true);
        setError("");
        try {
            const data = await fetchAdminCatalogLandings({
                page: targetPage,
                search: targetSearch.trim() || undefined,
            });
            setItems(data.data || []);
            setMeta(data);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки посадочных");
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
            await deleteAdminCatalogLanding(deleteTarget.id);
            setSuccess("Посадочная удалена");
            setDeleteTarget(null);
            await loadItems(page, debouncedSearch);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка удаления");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="SEO-посадочные каталога"
                description="Индексируемые URL /catalog/{slug} с фильтрами и текстом"
                action={
                    <Link
                        href="/admin/catalog-landings/create"
                        className="inline-flex items-center justify-center rounded-lg bg-admin-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-admin-primary-hover"
                    >
                        Создать
                    </Link>
                }
            />

            <ContentCatalogTabs />

            {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}
            {success ? <AdminFeedbackMessage type="success" message={success} onCloseAction={() => setSuccess("")} /> : null}

            <AdminTableShell
                total={meta?.total ?? items.length}
                search={
                    <AdminSearchInput
                        value={searchInput}
                        onChangeAction={setSearchInput}
                        placeholder="Поиск по slug, H1, title"
                    />
                }
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
                    <AdminLoadingState text="Загрузка посадочных..." />
                ) : items.length === 0 ? (
                    <AdminEmptyState title="Посадочных не найдено" description="Создайте первую SEO-страницу каталога." />
                ) : (
                    <CatalogLandingsTable items={items} onDeleteAction={setDeleteTarget} />
                )}
            </AdminTableShell>

            <AdminConfirmDialog
                open={!!deleteTarget}
                title="Удаление посадочной"
                message={deleteTarget ? `Удалить «${deleteTarget.h1}» (/catalog/${deleteTarget.slug})?` : ""}
                confirmText="Удалить"
                loading={deleting}
                onCloseAction={() => setDeleteTarget(null)}
                onConfirmAction={confirmDelete}
            />
        </AdminPageCard>
    );
}

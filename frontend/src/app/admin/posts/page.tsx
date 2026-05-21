"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ContentCatalogTabs from "@/components/admin/pages/content-catalog-tabs";
import PostsTable from "@/components/admin/posts/posts-table";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminFilterSelect from "@/components/admin/ui/admin-filter-select";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminTableShell from "@/components/admin/ui/admin-table-shell";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import {
    deleteAdminPost,
    fetchAdminPosts,
    type AdminPostItem,
    type AdminPostsResponse,
    type AdminPostType,
} from "@/lib/admin-posts-api";

const TYPE_OPTIONS = [
    { value: "news", label: "Новости" },
    { value: "article", label: "Статьи" },
];

export default function AdminPostsPage() {
    const searchParamsFromUrl = useSearchParams();
    const [items, setItems] = useState<AdminPostItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [searchInput, setSearchInput] = useState(() => searchParamsFromUrl.get("search") ?? "");
    const [typeFilter, setTypeFilter] = useState<AdminPostType | "">("");
    const [page, setPage] = useUrlPage();
    const [meta, setMeta] = useState<AdminPostsResponse | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AdminPostItem | null>(null);
    const [deleting, setDeleting] = useState(false);

    const debouncedSearch = useDebouncedValue(searchInput, 400);

    const loadItems = useCallback(async (targetPage: number, targetSearch: string, targetType: AdminPostType | "") => {
        setLoading(true);
        setError("");
        try {
            const data = await fetchAdminPosts({
                page: targetPage,
                search: targetSearch.trim() || undefined,
                type: targetType || undefined,
            });
            setItems(data.data || []);
            setMeta(data);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки публикаций");
        } finally {
            setLoading(false);
        }
    }, []);

    useResetPageOnChange(setPage, [debouncedSearch, typeFilter]);

    useEffect(() => {
        void loadItems(page, debouncedSearch, typeFilter);
    }, [loadItems, page, debouncedSearch, typeFilter]);

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        setError("");
        setSuccess("");
        try {
            const data = await deleteAdminPost(deleteTarget.id);
            setSuccess(data.message || "Публикация удалена");
            setDeleteTarget(null);
            await loadItems(page, debouncedSearch, typeFilter);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка удаления публикации");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Новости и статьи"
                description="Единый каталог публикаций"
                action={
                    <Link href="/admin/posts/create" className="inline-flex items-center justify-center rounded-lg bg-admin-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-admin-primary-hover">
                        Создать публикацию
                    </Link>
                }
            />

            <ContentCatalogTabs />

            {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}
            {success ? <AdminFeedbackMessage type="success" message={success} onCloseAction={() => setSuccess("")} /> : null}

            <AdminTableShell
                total={meta?.total ?? items.length}
                search={
                    <div className="flex w-full flex-wrap gap-2">
                        <AdminSearchInput value={searchInput} onChangeAction={setSearchInput} placeholder="Поиск по названию или краткому содержанию" />
                        <AdminFilterSelect
                            value={typeFilter}
                            onChangeAction={(value) => setTypeFilter(value as AdminPostType | "")}
                            options={TYPE_OPTIONS}
                            placeholder="Все типы"
                            className="min-w-[180px]"
                        />
                    </div>
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
                    <AdminLoadingState text="Загрузка публикаций..." />
                ) : items.length === 0 ? (
                    <AdminEmptyState title="Публикации не найдены" description="Создайте первую новость или статью." />
                ) : (
                    <PostsTable items={items} onDeleteAction={setDeleteTarget} />
                )}
            </AdminTableShell>

            <AdminConfirmDialog
                open={!!deleteTarget}
                title="Удаление публикации"
                message={deleteTarget ? `Удалить "${deleteTarget.title}"?` : ""}
                confirmText="Удалить"
                loading={deleting}
                onCloseAction={() => setDeleteTarget(null)}
                onConfirmAction={confirmDelete}
            />
        </AdminPageCard>
    );
}

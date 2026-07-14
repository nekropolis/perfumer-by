"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminTableShell from "@/components/admin/ui/admin-table-shell";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import ProductVariantDefinitionsTable from "@/components/admin/products/product-variant-definitions-table";
import ProductCatalogTabs from "@/components/admin/products/product-catalog-tabs";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import {
    deleteVariantDefinition,
    fetchVariantDefinitions,
    type VariantDefinitionItem,
    type VariantDefinitionsResponse,
} from "@/lib/admin-product-variants-api";

const PER_PAGE = 50;

export default function AdminProductVariantsPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParamsFromUrl = useSearchParams();

    // Search инициализируется из URL один раз, дальше URL ведёт сам AdminSearchInput.
    // Page — через общий хук useUrlPage (?page=N в URL, пишется только если > 1).
    const [searchInput, setSearchInput] = useState(
        () => searchParamsFromUrl.get("search") ?? "",
    );
    const [page, setPage] = useUrlPage();

    const [items, setItems] = useState<VariantDefinitionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [meta, setMeta] = useState<VariantDefinitionsResponse | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<VariantDefinitionItem | null>(null);
    const [deleting, setDeleting] = useState(false);

    const debouncedSearch = useDebouncedValue(searchInput, 350);

    const loadItems = useCallback(async (targetPage: number, targetSearch: string) => {
        setLoading(true);
        setError("");

        try {
            const data = await fetchVariantDefinitions({
                search: targetSearch.trim() || undefined,
                page: targetPage,
                per_page: PER_PAGE,
            });
            setItems(data.data || []);
            setMeta(data);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки вариантов");
        } finally {
            setLoading(false);
        }
    }, []);

    useResetPageOnChange(setPage, [debouncedSearch]);

    useEffect(() => {
        void loadItems(page, debouncedSearch);
    }, [debouncedSearch, loadItems, page]);

    const handleDelete = async () => {
        if (!deleteTarget) {
            return;
        }

        setDeleting(true);
        setError("");
        setSuccess("");

        try {
            const response = await deleteVariantDefinition(deleteTarget.id);
            setSuccess(response.message || "Вариант удален");
            setDeleteTarget(null);
            await loadItems(page, debouncedSearch);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка удаления варианта");
        } finally {
            setDeleting(false);
        }
    };

    const hasActiveFilters = useMemo(() => searchInput.trim() !== "", [searchInput]);

    const resetSearch = useCallback(() => {
        setSearchInput("");
        setPage(1);
        // AdminSearchInput обновляет URL только на события ввода; при программном
        // сбросе делаем это вручную, чтобы ?search= тоже ушёл из URL.
        const params = new URLSearchParams(searchParamsFromUrl.toString());
        params.delete("search");
        params.delete("page");
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [pathname, router, searchParamsFromUrl, setPage]);

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Варианты продукта"
                description="Справочник вариантов товара: объем, концентрация, тестер"
                action={
                    <Link
                        href="/admin/products/variants/create"
                        className="inline-flex items-center justify-center rounded-full bg-admin-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-admin-primary-hover"
                    >
                        Новый вариант
                    </Link>
                }
            />

            <ProductCatalogTabs />

            {error ? (
                <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
            ) : null}

            {success ? (
                <AdminFeedbackMessage type="success" message={success} onCloseAction={() => setSuccess("")} />
            ) : null}

            <AdminTableShell
                total={meta?.total ?? items.length}
                search={
                    <div className="flex items-center gap-2">
                        <AdminSearchInput
                            value={searchInput}
                            onChangeAction={setSearchInput}
                            placeholder="Поиск по мл или названию варианта"
                        />
                        {hasActiveFilters ? (
                            <button
                                type="button"
                                onClick={resetSearch}
                                className="rounded-xl border px-3 py-2 text-sm text-admin-text-secondary hover:bg-admin-muted"
                                title="Сбросить поиск"
                            >
                                Сбросить
                            </button>
                        ) : null}
                    </div>
                }
                footer={
                    <AdminPagination
                        currentPage={meta?.current_page ?? 1}
                        lastPage={meta?.last_page ?? 1}
                        onPrevAction={() => setPage((p) => Math.max(1, p - 1))}
                        onNextAction={() =>
                            setPage((p) =>
                                meta && (meta.current_page ?? 1) < (meta.last_page ?? 1) ? p + 1 : p
                            )
                        }
                    />
                }
            >
                {loading && items.length === 0 ? (
                    <AdminLoadingState text="Загрузка вариантов..." />
                ) : items.length === 0 ? (
                    <AdminEmptyState
                        title="Варианты не найдены"
                        description="Попробуйте изменить поисковый запрос или создайте новый вариант."
                    />
                ) : (
                    <ProductVariantDefinitionsTable
                        items={items}
                        onDeleteAction={setDeleteTarget}
                    />
                )}
            </AdminTableShell>

            <AdminConfirmDialog
                open={!!deleteTarget}
                title="Удаление варианта"
                message={deleteTarget ? `Удалить вариант "${deleteTarget.title}"?` : ""}
                confirmText="Удалить"
                loading={deleting}
                onCloseAction={() => setDeleteTarget(null)}
                onConfirmAction={handleDelete}
            />
        </AdminPageCard>
    );
}

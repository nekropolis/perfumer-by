"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminTableShell from "@/components/admin/ui/admin-table-shell";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminFilterSelect from "@/components/admin/ui/admin-filter-select";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import {
    fetchAdminLegacyProductDetail,
    fetchAdminLegacyProducts,
    linkAdminLegacyProduct,
    searchAdminLegacyProductTargets,
    skipAdminLegacyProduct,
    type LegacyTargetProductCandidate,
    type LegacyUnmatchedProductDetail,
    type LegacyUnmatchedProductItem,
} from "@/lib/admin-legacy-products-api";
import ContentCatalogTabs from "@/components/admin/pages/content-catalog-tabs";

export default function AdminLegacyProductsPage() {
    const [items, setItems] = useState<LegacyUnmatchedProductItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [statusFilter, setStatusFilter] = useState<"" | "unmatched" | "linked" | "skipped">("unmatched");
    const [page, setPage] = useUrlPage();
    const [meta, setMeta] = useState<{ current_page: number; last_page: number; total: number } | null>(null);

    const [linkTarget, setLinkTarget] = useState<LegacyUnmatchedProductItem | null>(null);
    const [linkDetail, setLinkDetail] = useState<LegacyUnmatchedProductDetail | null>(null);
    const [targetSearchInput, setTargetSearchInput] = useState("");
    const [targetCandidates, setTargetCandidates] = useState<LegacyTargetProductCandidate[]>([]);
    const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
    const [linking, setLinking] = useState(false);

    const [skipTarget, setSkipTarget] = useState<LegacyUnmatchedProductItem | null>(null);
    const [skipReason, setSkipReason] = useState("");
    const [skipping, setSkipping] = useState(false);

    const debouncedSearch = useDebouncedValue(searchInput, 350);
    const debouncedTargetSearch = useDebouncedValue(targetSearchInput, 300);
    useResetPageOnChange(setPage, [debouncedSearch, statusFilter]);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetchAdminLegacyProducts({
                page,
                search: debouncedSearch || undefined,
                status: statusFilter,
            });
            setItems(response.data || []);
            setMeta({
                current_page: response.current_page,
                last_page: response.last_page,
                total: response.total,
            });
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки legacy товаров");
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearch, statusFilter]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        const run = async () => {
            if (!linkTarget || debouncedTargetSearch.trim().length < 2) {
                setTargetCandidates([]);
                return;
            }
            try {
                const response = await searchAdminLegacyProductTargets(linkTarget.id, debouncedTargetSearch.trim());
                setTargetCandidates(response.data || []);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Ошибка поиска целевого продукта");
            }
        };
        void run();
    }, [linkTarget, debouncedTargetSearch]);

    const openLinkModal = async (item: LegacyUnmatchedProductItem) => {
        setError("");
        setSuccess("");
        setLinkTarget(item);
        setSelectedTargetId(null);
        setTargetSearchInput(item.legacy_name || item.legacy_slug || "");
        try {
            const detail = await fetchAdminLegacyProductDetail(item.id);
            setLinkDetail(detail.data);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки деталей legacy товара");
            setLinkDetail(null);
        }
    };

    const closeLinkModal = () => {
        setLinkTarget(null);
        setLinkDetail(null);
        setTargetSearchInput("");
        setTargetCandidates([]);
        setSelectedTargetId(null);
    };

    const confirmLink = async () => {
        if (!linkTarget || !selectedTargetId) return;
        setLinking(true);
        setError("");
        setSuccess("");
        try {
            const response = await linkAdminLegacyProduct(linkTarget.id, selectedTargetId);
            setSuccess(response.message || "Legacy товар связан");
            closeLinkModal();
            await load();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка связывания legacy товара");
        } finally {
            setLinking(false);
        }
    };

    const confirmSkip = async () => {
        if (!skipTarget) return;
        const reason = skipReason.trim();
        if (!reason) {
            setError("Укажите причину пропуска");
            return;
        }

        setSkipping(true);
        setError("");
        setSuccess("");
        try {
            const response = await skipAdminLegacyProduct(skipTarget.id, reason);
            setSuccess(response.message || "Legacy товар пропущен");
            setSkipTarget(null);
            setSkipReason("");
            await load();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка пропуска legacy товара");
        } finally {
            setSkipping(false);
        }
    };

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Legacy products"
                description="Ручная обработка unmatched товаров: связать или пропустить"
            />

            <ContentCatalogTabs />

            {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}
            {success ? <AdminFeedbackMessage type="success" message={success} onCloseAction={() => setSuccess("")} /> : null}

            <AdminTableShell
                total={meta?.total ?? items.length}
                search={(
                    <div className="flex w-full flex-wrap gap-2">
                        <AdminSearchInput
                            value={searchInput}
                            onChangeAction={setSearchInput}
                            placeholder="Поиск по legacy id / slug / name"
                        />
                        <AdminFilterSelect
                            value={statusFilter}
                            onChangeAction={(v) => setStatusFilter(v as "" | "unmatched" | "linked" | "skipped")}
                            options={[
                                { value: "unmatched", label: "Unmatched" },
                                { value: "linked", label: "Linked" },
                                { value: "skipped", label: "Skipped" },
                            ]}
                            placeholder="Все статусы"
                            className="min-w-[180px]"
                        />
                    </div>
                )}
                footer={(
                    <AdminPagination
                        currentPage={meta?.current_page ?? 1}
                        lastPage={meta?.last_page ?? 1}
                        onPrevAction={() => setPage((p) => Math.max(1, p - 1))}
                        onNextAction={() => setPage((p) => (meta && meta.current_page < meta.last_page ? p + 1 : p))}
                    />
                )}
            >
                {loading && items.length === 0 ? (
                    <AdminLoadingState text="Загрузка legacy товаров..." />
                ) : items.length === 0 ? (
                    <AdminEmptyState title="Записей нет" description="Unmatched legacy продукты не найдены." />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-admin-text-secondary">
                                    <th className="px-3 py-2">Legacy ID</th>
                                    <th className="px-3 py-2">Slug</th>
                                    <th className="px-3 py-2">Название</th>
                                    <th className="px-3 py-2">Статус</th>
                                    <th className="px-3 py-2">Связан с</th>
                                    <th className="px-3 py-2 text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr key={item.id} className="border-b last:border-b-0">
                                        <td className="px-3 py-2">{item.legacy_product_id}</td>
                                        <td className="px-3 py-2 font-mono text-xs">{item.legacy_slug || "—"}</td>
                                        <td className="px-3 py-2">{item.legacy_name || "—"}</td>
                                        <td className="px-3 py-2">{item.status}</td>
                                        <td className="px-3 py-2">
                                            {item.linked_product_id
                                                ? `${item.linked_product_name || "—"} (${item.linked_product_slug || "—"})`
                                                : "—"}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            {item.status === "unmatched" ? (
                                                <div className="inline-flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => void openLinkModal(item)}
                                                        className="rounded-lg border px-3 py-1 text-xs"
                                                    >
                                                        Связать
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSkipTarget(item);
                                                            setSkipReason("");
                                                        }}
                                                        className="rounded-lg border border-amber-300 px-3 py-1 text-xs text-amber-800"
                                                    >
                                                        Пропустить
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-admin-text-secondary">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </AdminTableShell>

            {linkTarget ? (
                <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/50 p-4">
                    <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold">Связать legacy продукт</h2>
                            <button type="button" onClick={closeLinkModal} className="rounded-lg border px-3 py-1 text-sm">
                                Закрыть
                            </button>
                        </div>

                        {linkDetail ? (
                            <div className="mb-4 grid gap-4 md:grid-cols-2">
                                <div className="rounded-xl border p-3">
                                    <div className="mb-1 text-xs text-admin-text-secondary">Legacy</div>
                                    <div className="text-sm"><b>ID:</b> {linkDetail.legacy_product_id}</div>
                                    <div className="text-sm"><b>Slug:</b> {linkDetail.legacy_slug || "—"}</div>
                                    <div className="text-sm"><b>Name:</b> {linkDetail.legacy_name || "—"}</div>
                                    <div className="mt-2 text-xs text-admin-text-secondary line-clamp-6">{linkDetail.legacy_meta_description || linkDetail.legacy_description || "—"}</div>
                                </div>

                                <div className="rounded-xl border p-3">
                                    <div className="mb-2 text-xs text-admin-text-secondary">Целевой текущий продукт</div>
                                    <input
                                        type="text"
                                        value={targetSearchInput}
                                        onChange={(e) => setTargetSearchInput(e.target.value)}
                                        placeholder="Поиск по name/slug (мин. 2 символа)"
                                        className="mb-2 w-full rounded-xl border px-3 py-2 text-sm"
                                    />
                                    <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border p-2">
                                        {targetCandidates.length === 0 ? (
                                            <div className="text-xs text-admin-text-secondary">Ничего не найдено</div>
                                        ) : (
                                            targetCandidates.map((candidate) => (
                                                <label key={candidate.id} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 hover:bg-admin-muted">
                                                    <input
                                                        type="radio"
                                                        name="target_product"
                                                        checked={selectedTargetId === candidate.id}
                                                        onChange={() => setSelectedTargetId(candidate.id)}
                                                    />
                                                    <span className="text-sm">
                                                        <span className="font-medium">{candidate.name}</span>
                                                        <span className="ml-1 text-xs text-admin-text-secondary">({candidate.slug})</span>
                                                        {candidate.brand_name ? (
                                                            <span className="ml-1 text-xs text-admin-text-secondary">· {candidate.brand_name}</span>
                                                        ) : null}
                                                    </span>
                                                </label>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <AdminLoadingState text="Загрузка деталей..." />
                        )}

                        <div className="flex items-center justify-end gap-2 border-t pt-4">
                            <button type="button" onClick={closeLinkModal} className="rounded-xl border px-4 py-2 text-sm">
                                Отмена
                            </button>
                            <button
                                type="button"
                                onClick={confirmLink}
                                disabled={!selectedTargetId || linking}
                                className="rounded-full bg-admin-primary px-4 py-2 text-sm text-white shadow-sm transition hover:bg-admin-primary-hover disabled:opacity-50"
                            >
                                {linking ? "Связывание..." : "Подтвердить связь (перезаписать поля + 301)"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {skipTarget ? (
                <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/50 p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-5">
                        <h2 className="text-lg font-semibold">Пропустить legacy продукт</h2>
                        <p className="mt-1 text-sm text-admin-text-secondary">
                            ID {skipTarget.legacy_product_id} ({skipTarget.legacy_slug || "без slug"})
                        </p>
                        <div className="mt-4">
                            <label className="mb-1 block text-xs text-admin-text-secondary">Причина пропуска</label>
                            <textarea
                                value={skipReason}
                                onChange={(e) => setSkipReason(e.target.value)}
                                className="min-h-[120px] w-full rounded-xl border px-3 py-2 text-sm"
                            />
                        </div>
                        <div className="mt-4 flex justify-end gap-2 border-t pt-4">
                            <button
                                type="button"
                                onClick={() => setSkipTarget(null)}
                                className="rounded-xl border px-4 py-2 text-sm"
                            >
                                Отмена
                            </button>
                            <button
                                type="button"
                                onClick={confirmSkip}
                                disabled={skipping}
                                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 disabled:opacity-50"
                            >
                                {skipping ? "Сохранение..." : "Пропустить"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </AdminPageCard>
    );
}

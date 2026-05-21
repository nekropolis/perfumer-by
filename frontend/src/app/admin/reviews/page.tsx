"use client";

import Link from "next/link";
import { CheckCircle2, MessageSquareReply, RotateCcw, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminTableShell from "@/components/admin/ui/admin-table-shell";
import AdminFilterSelect from "@/components/admin/ui/admin-filter-select";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import {
    fetchAdminReviews,
    patchAdminReviewReply,
    patchAdminReviewStatus,
    type AdminReviewItem,
    type AdminReviewsListResponse,
} from "@/lib/admin-reviews-api";

const DAYS_OPTIONS = [
    { value: "1", label: "За сутки" },
    { value: "7", label: "За 7 дней" },
    { value: "30", label: "За 30 дней" },
    { value: "90", label: "За 90 дней" },
];

const STATUS_OPTIONS = [
    { value: "pending", label: "На модерации" },
    { value: "published", label: "Опубликован" },
    { value: "rejected", label: "Отклонён" },
];

const TYPE_OPTIONS = [
    { value: "product", label: "О товаре" },
    { value: "store", label: "О магазине" },
];

const STATUS_LABEL: Record<string, string> = {
    pending: "На модерации",
    published: "Опубликован",
    rejected: "Отклонён",
};

function formatDt(iso: string | null): string {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
    } catch {
        return iso;
    }
}

export default function AdminReviewsPage() {
    const searchParamsFromUrl = useSearchParams();
    const [items, setItems] = useState<AdminReviewItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const [searchInput, setSearchInput] = useState(() => searchParamsFromUrl.get("search") ?? "");
    const [days, setDays] = useState(() => searchParamsFromUrl.get("days") ?? "");
    const [statusFilter, setStatusFilter] = useState(() => searchParamsFromUrl.get("status") ?? "");
    const [typeFilter, setTypeFilter] = useState(() => searchParamsFromUrl.get("type") ?? "");

    const [page, setPage] = useUrlPage();
    const [meta, setMeta] = useState<AdminReviewsListResponse | null>(null);
    const [savingId, setSavingId] = useState<number | null>(null);

    const [replyModal, setReplyModal] = useState<AdminReviewItem | null>(null);
    const [replyDraft, setReplyDraft] = useState("");
    const [replySaving, setReplySaving] = useState(false);

    const debouncedSearch = useDebouncedValue(searchInput, 400);

    const loadItems = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const data = await fetchAdminReviews({
                page,
                search: debouncedSearch.trim() || undefined,
                status: statusFilter || undefined,
                type: typeFilter || undefined,
                days: days || undefined,
            });
            setItems(data.data || []);
            setMeta(data);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки отзывов");
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearch, statusFilter, typeFilter, days]);

    useResetPageOnChange(setPage, [debouncedSearch, statusFilter, typeFilter, days]);

    useEffect(() => {
        void loadItems();
    }, [loadItems]);

    const handleStatus = async (row: AdminReviewItem, status: AdminReviewItem["status"]) => {
        setSavingId(row.id);
        setError("");
        setSuccess("");
        try {
            const res = await patchAdminReviewStatus(row.id, status);
            setSuccess(res.message);
            setItems((prev) => prev.map((x) => (x.id === row.id ? res.data : x)));
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Не удалось обновить статус");
        } finally {
            setSavingId(null);
        }
    };

    const openReply = (row: AdminReviewItem) => {
        setReplyDraft(row.reply_text ?? "");
        setReplyModal(row);
    };

    const saveReply = async () => {
        if (!replyModal) return;
        setReplySaving(true);
        setError("");
        setSuccess("");
        try {
            const trimmed = replyDraft.trim();
            const res = await patchAdminReviewReply(replyModal.id, trimmed === "" ? null : trimmed);
            setSuccess(res.message);
            setItems((prev) => prev.map((x) => (x.id === replyModal.id ? res.data : x)));
            setReplyModal(null);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Не удалось сохранить ответ");
        } finally {
            setReplySaving(false);
        }
    };

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Отзывы"
                description="Модерация отзывов о товарах и о магазине. Опубликованные отзывы видны на витрине; можно ответить от имени магазина."
            />

            {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}
            {success ? <AdminFeedbackMessage type="success" message={success} onCloseAction={() => setSuccess("")} /> : null}

            <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
                <AdminFilterSelect
                    value={days}
                    onChangeAction={setDays}
                    label="Период"
                    options={DAYS_OPTIONS}
                    placeholder="За всё время"
                />
                <AdminFilterSelect
                    value={statusFilter}
                    onChangeAction={setStatusFilter}
                    label="Статус"
                    options={STATUS_OPTIONS}
                    placeholder="Все статусы"
                />
                <AdminFilterSelect
                    value={typeFilter}
                    onChangeAction={setTypeFilter}
                    label="Тип"
                    options={TYPE_OPTIONS}
                    placeholder="Все типы"
                />
            </div>

            <AdminTableShell
                total={meta?.total ?? items.length}
                search={
                    <AdminSearchInput
                        value={searchInput}
                        onChangeAction={setSearchInput}
                        placeholder="Поиск по имени автора"
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
                    <AdminLoadingState text="Загрузка отзывов..." />
                ) : items.length === 0 ? (
                    <AdminEmptyState title="Отзывов нет" description="Измените фильтры или дождитесь новых отзывов от покупателей." />
                ) : (
                    <div className="min-w-[860px]">
                        <table className="w-full border-collapse text-left text-sm">
                            <thead className="border-b border-admin-border bg-admin-muted text-xs font-medium uppercase text-admin-text-secondary">
                                <tr>
                                    <th className="px-3 py-2">ID</th>
                                    <th className="px-3 py-2">Дата</th>
                                    <th className="px-3 py-2">Тип</th>
                                    <th className="px-3 py-2">Имя</th>
                                    <th className="px-3 py-2">★</th>
                                    <th className="px-3 py-2">Товар</th>
                                    <th className="px-3 py-2">Статус</th>
                                    <th className="px-3 py-2 text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((row) => (
                                    <tr key={row.id} className="border-b border-admin-border align-top last:border-0">
                                        <td className="px-3 py-2 whitespace-nowrap text-admin-text-secondary">{row.id}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-admin-text-secondary">{formatDt(row.created_at)}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            {row.type === "store" ? (
                                                <span className="rounded-md bg-violet-50 px-2 py-0.5 text-xs text-violet-800">Магазин</span>
                                            ) : (
                                                <span className="rounded-md bg-sky-50 px-2 py-0.5 text-xs text-sky-800">Товар</span>
                                            )}
                                        </td>
                                        <td className="max-w-[140px] px-3 py-2">
                                            <div className="truncate font-medium text-admin-text" title={row.name}>
                                                {row.name}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">{row.stars}</td>
                                        <td className="max-w-[180px] px-3 py-2 text-admin-text">
                                            {row.product ? (
                                                <Link
                                                    href={`/product/${row.product.slug}`}
                                                    className="line-clamp-2 text-[var(--accent)] underline-offset-2 hover:underline"
                                                    target="_blank"
                                                    rel="noreferrer"
                                                >
                                                    {row.product.name}
                                                </Link>
                                            ) : (
                                                "Магазин"
                                            )}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-admin-text">{STATUS_LABEL[row.status] ?? row.status}</td>
                                        <td className="px-3 py-2 text-right">
                                            <div className="flex flex-wrap justify-end gap-1">
                                                {row.status !== "published" ? (
                                                    <button
                                                        type="button"
                                                        disabled={savingId === row.id}
                                                        onClick={() => handleStatus(row, "published")}
                                                        title="Опубликовать"
                                                        aria-label="Опубликовать"
                                                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-50"
                                                    >
                                                        <CheckCircle2 className="h-4 w-4" aria-hidden />
                                                    </button>
                                                ) : null}
                                                {row.status !== "pending" ? (
                                                    <button
                                                        type="button"
                                                        disabled={savingId === row.id}
                                                        onClick={() => handleStatus(row, "pending")}
                                                        title="Вернуть на модерацию"
                                                        aria-label="Вернуть на модерацию"
                                                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
                                                    >
                                                        <RotateCcw className="h-4 w-4" aria-hidden />
                                                    </button>
                                                ) : null}
                                                {row.status !== "rejected" ? (
                                                    <button
                                                        type="button"
                                                        disabled={savingId === row.id}
                                                        onClick={() => handleStatus(row, "rejected")}
                                                        title="Отклонить"
                                                        aria-label="Отклонить"
                                                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-900 transition hover:bg-rose-100 disabled:opacity-50"
                                                    >
                                                        <XCircle className="h-4 w-4" aria-hidden />
                                                    </button>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    onClick={() => openReply(row)}
                                                    title="Отзыв и ответ магазина"
                                                    aria-label="Открыть отзыв и ответ магазина"
                                                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-admin-border bg-white text-admin-text transition hover:bg-admin-muted"
                                                >
                                                    <MessageSquareReply className="h-4 w-4" aria-hidden />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </AdminTableShell>

            {replyModal ? (
                <div
                    className="fixed inset-0 z-[220] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
                    onClick={() => setReplyModal(null)}
                >
                    <div
                        role="dialog"
                        onClick={(e) => e.stopPropagation()}
                        aria-modal="true"
                        aria-labelledby="reply-modal-title"
                        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-admin-border bg-white p-5 shadow-xl"
                    >
                        <h2 id="reply-modal-title" className="mb-1 text-lg font-semibold text-admin-text">
                            Отзыв и ответ #{replyModal.id}
                        </h2>
                        <p className="mb-4 text-xs text-admin-text-secondary">
                            {replyModal.name} · {formatDt(replyModal.created_at)} · {STATUS_LABEL[replyModal.status] ?? replyModal.status}
                            {replyModal.type === "store"
                                ? " · Магазин"
                                : replyModal.product
                                  ? ` · ${replyModal.product.name}`
                                  : " · Товар"}
                            {` · ${replyModal.stars}★`}
                        </p>
                        <div className="mb-4">
                            <div className="mb-1.5 text-sm font-medium text-admin-text">Текст отзыва</div>
                            <div className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-admin-border bg-admin-muted p-3 text-sm leading-relaxed text-admin-text">
                                {replyModal.text}
                            </div>
                        </div>
                        <label className="mb-1 block text-sm font-medium text-admin-text" htmlFor="reply-modal-textarea">
                            Ответ магазина
                        </label>
                        <textarea
                            id="reply-modal-textarea"
                            value={replyDraft}
                            onChange={(e) => setReplyDraft(e.target.value)}
                            rows={6}
                            maxLength={4000}
                            className="mb-4 w-full rounded-xl border border-admin-border px-3 py-2 text-sm outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                        />
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => saveReply()}
                                disabled={replySaving}
                                className="rounded-full bg-admin-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-admin-primary-hover disabled:opacity-50"
                            >
                                {replySaving ? "Сохранение…" : "Сохранить"}
                            </button>
                            <button
                                type="button"
                                disabled={replySaving}
                                onClick={async () => {
                                    setReplyDraft("");
                                    const id = replyModal.id;
                                    setReplySaving(true);
                                    try {
                                        const res = await patchAdminReviewReply(id, null);
                                        setSuccess(res.message);
                                        setItems((prev) => prev.map((x) => (x.id === id ? res.data : x)));
                                        setReplyModal(null);
                                    } catch (e: unknown) {
                                        setError(e instanceof Error ? e.message : "Ошибка");
                                    } finally {
                                        setReplySaving(false);
                                    }
                                }}
                                className="rounded-xl border border-admin-border px-4 py-2 text-sm text-admin-text transition hover:bg-admin-muted disabled:opacity-50"
                            >
                                Удалить ответ
                            </button>
                            <button
                                type="button"
                                onClick={() => setReplyModal(null)}
                                className="rounded-xl border border-admin-border px-4 py-2 text-sm text-admin-text transition hover:bg-admin-muted"
                            >
                                Закрыть
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </AdminPageCard>
    );
}

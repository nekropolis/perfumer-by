"use client";

import { adminBtnPrimary, adminBtnSecondary, adminCheckbox } from "@/lib/admin-ui-classes";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminTableShell from "@/components/admin/ui/admin-table-shell";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import AdminModalShell from "@/components/admin/ui/admin-modal-shell";
import {
    createAdminSeoRedirect,
    deleteAdminSeoRedirect,
    fetchAdminSeoRedirects,
    type AdminSeoRedirectItem,
    updateAdminSeoRedirect,
} from "@/lib/admin-seo-redirects-api";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import SeoSectionTabs from "@/components/admin/seo/seo-section-tabs";

type RedirectFormState = {
    id?: number;
    from_path: string;
    to_path: string;
    http_code: "301" | "302" | "410";
    is_active: boolean;
    source: string;
    note: string;
};

const EMPTY_FORM: RedirectFormState = {
    from_path: "",
    to_path: "",
    http_code: "301",
    is_active: true,
    source: "manual",
    note: "",
};

export default function AdminSeoRedirectsPage() {
    const [items, setItems] = useState<AdminSeoRedirectItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [searchInput, setSearchInput] = useState("");
    const [activeFilter, setActiveFilter] = useState<"" | "1" | "0">("");
    const [codeFilter, setCodeFilter] = useState<"" | "301" | "302" | "410">("");
    const [form, setForm] = useState<RedirectFormState>(EMPTY_FORM);
    const [formOpen, setFormOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<AdminSeoRedirectItem | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [page, setPage] = useUrlPage();
    const [meta, setMeta] = useState<{ current_page: number; last_page: number; total: number } | null>(null);

    const debouncedSearch = useDebouncedValue(searchInput, 350);
    useResetPageOnChange(setPage, [debouncedSearch, activeFilter, codeFilter]);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const response = await fetchAdminSeoRedirects({
                page,
                per_page: 25,
                search: debouncedSearch || undefined,
                is_active: activeFilter,
                http_code: codeFilter,
            });

            setItems(response.data || []);
            setMeta({
                current_page: response.current_page,
                last_page: response.last_page,
                total: response.total,
            });
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки редиректов");
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearch, activeFilter, codeFilter]);

    useEffect(() => {
        void load();
    }, [load]);

    const closeForm = () => {
        setFormOpen(false);
        setForm(EMPTY_FORM);
    };

    const openCreate = () => {
        setForm(EMPTY_FORM);
        setFormOpen(true);
        setError("");
        setSuccess("");
    };

    const startEdit = (item: AdminSeoRedirectItem) => {
        setForm({
            id: item.id,
            from_path: item.from_path,
            to_path: item.to_path ?? "",
            http_code: String(item.http_code) as "301" | "302" | "410",
            is_active: item.is_active,
            source: item.source || "manual",
            note: item.note ?? "",
        });
        setFormOpen(true);
        setError("");
        setSuccess("");
    };

    const handleSave = async () => {
        setSubmitting(true);
        setError("");
        setSuccess("");

        try {
            const payload = {
                from_path: form.from_path,
                to_path: form.to_path.trim() || null,
                http_code: Number(form.http_code) as 301 | 302 | 410,
                is_active: form.is_active,
                source: form.source.trim() || "manual",
                note: form.note.trim() || null,
            };

            if (form.id) {
                await updateAdminSeoRedirect(form.id, payload);
                setSuccess("Редирект обновлён");
            } else {
                await createAdminSeoRedirect(payload);
                setSuccess("Редирект создан");
            }

            closeForm();
            await load();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка сохранения редиректа");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;

        setDeleting(true);
        setError("");
        setSuccess("");

        try {
            await deleteAdminSeoRedirect(deleteTarget.id);
            setSuccess("Редирект удалён");
            setDeleteTarget(null);
            await load();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка удаления редиректа");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="SEO редиректы"
                description="Таблица 301/302/410 редиректов"
                action={(
                    <button type="button" onClick={openCreate} className={adminBtnPrimary}>
                        Добавить редирект
                    </button>
                )}
            />

            <SeoSectionTabs />

            {!formOpen && error ? (
                <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
            ) : null}
            {success ? (
                <AdminFeedbackMessage type="success" message={success} onCloseAction={() => setSuccess("")} />
            ) : null}

            <AdminTableShell
                total={meta?.total ?? items.length}
                search={(
                    <>
                        <AdminStatusDropdown
                            value={activeFilter}
                            onChangeAction={(v) => setActiveFilter(v as "" | "1" | "0")}
                            options={[
                                { value: "", label: "Все" },
                                { value: "1", label: "Активные" },
                                { value: "0", label: "Неактивные" },
                            ]}
                            widthClassName="w-max"
                            menuWidthClassName="w-max"
                        />
                        <AdminStatusDropdown
                            value={codeFilter}
                            onChangeAction={(v) => setCodeFilter(v as "" | "301" | "302" | "410")}
                            options={[
                                { value: "", label: "Все коды" },
                                { value: "301", label: "301" },
                                { value: "302", label: "302" },
                                { value: "410", label: "410" },
                            ]}
                            widthClassName="w-max"
                            menuWidthClassName="w-max"
                        />
                        <AdminSearchInput
                            value={searchInput}
                            onChangeAction={setSearchInput}
                            placeholder="Поиск по from/to/comment"
                        />
                    </>
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
                    <AdminLoadingState text="Загрузка редиректов..." />
                ) : items.length === 0 ? (
                    <AdminEmptyState title="Редиректы не найдены" description="Нажмите «Добавить редирект»." />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-admin-text-secondary">
                                    <th className="px-3 py-2">ID</th>
                                    <th className="px-3 py-2">From</th>
                                    <th className="px-3 py-2">To</th>
                                    <th className="px-3 py-2">Код</th>
                                    <th className="px-3 py-2">Активен</th>
                                    <th className="px-3 py-2">Source</th>
                                    <th className="px-3 py-2">Hits</th>
                                    <th className="px-3 py-2 text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr key={item.id} className="border-b last:border-b-0">
                                        <td className="px-3 py-2">{item.id}</td>
                                        <td className="px-3 py-2 font-mono text-xs">{item.from_path}</td>
                                        <td className="px-3 py-2 font-mono text-xs">{item.to_path || "—"}</td>
                                        <td className="px-3 py-2">{item.http_code}</td>
                                        <td className="px-3 py-2">{item.is_active ? "Да" : "Нет"}</td>
                                        <td className="px-3 py-2">{item.source}</td>
                                        <td className="px-3 py-2">{item.hit_count}</td>
                                        <td className="px-3 py-2 text-right">
                                            <div className="flex justify-end gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => startEdit(item)}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-admin-border text-admin-text transition hover:bg-admin-muted"
                                                    aria-label={`Редактировать редирект ${item.from_path}`}
                                                    title="Редактировать"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDeleteTarget(item)}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50"
                                                    aria-label={`Удалить редирект ${item.from_path}`}
                                                    title="Удалить"
                                                >
                                                    <Trash2 size={16} />
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

            <AdminModalShell
                open={formOpen}
                onCloseAction={() => {
                    if (!submitting) closeForm();
                }}
                title={form.id ? "Редактировать редирект" : "Добавить редирект"}
                maxWidthClass="sm:max-w-xl"
                footer={(
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            disabled={submitting}
                            onClick={closeForm}
                            className={adminBtnSecondary}
                        >
                            Отмена
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleSave()}
                            disabled={submitting}
                            className={adminBtnPrimary}
                        >
                            {submitting ? "Сохранение..." : form.id ? "Сохранить" : "Создать"}
                        </button>
                    </div>
                )}
            >
                {error ? (
                    <div className="mb-3">
                        <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                    </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs text-admin-text-secondary">From path</label>
                        <input
                            type="text"
                            value={form.from_path}
                            onChange={(e) => setForm((prev) => ({ ...prev, from_path: e.target.value }))}
                            placeholder="/old-path"
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                            autoFocus
                        />
                    </div>
                    <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs text-admin-text-secondary">To path</label>
                        <input
                            type="text"
                            value={form.to_path}
                            onChange={(e) => setForm((prev) => ({ ...prev, to_path: e.target.value }))}
                            placeholder="/new-path (для 410 можно пусто)"
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs text-admin-text-secondary">Код</label>
                        <select
                            value={form.http_code}
                            onChange={(e) => setForm((prev) => ({ ...prev, http_code: e.target.value as "301" | "302" | "410" }))}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                        >
                            <option value="301">301</option>
                            <option value="302">302</option>
                            <option value="410">410</option>
                        </select>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs text-admin-text-secondary">Активен</label>
                        <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                            <input
                                type="checkbox"
                                checked={form.is_active}
                                onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                                className={adminCheckbox}
                            />
                            Да
                        </label>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs text-admin-text-secondary">Source</label>
                        <input
                            type="text"
                            value={form.source}
                            onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs text-admin-text-secondary">Комментарий</label>
                        <input
                            type="text"
                            value={form.note}
                            onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                        />
                    </div>
                </div>
            </AdminModalShell>

            <AdminConfirmDialog
                open={!!deleteTarget}
                title="Удаление редиректа"
                message={deleteTarget ? `Удалить redirect "${deleteTarget.from_path}"?` : ""}
                confirmText="Удалить"
                loading={deleting}
                onCloseAction={() => setDeleteTarget(null)}
                onConfirmAction={handleDelete}
            />
        </AdminPageCard>
    );
}

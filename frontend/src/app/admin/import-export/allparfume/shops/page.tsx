"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AllparfumeAdminNav from "@/components/admin/import-export/allparfume-admin-nav";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import { adminCheckbox } from "@/lib/admin-ui-classes";
import {
    fetchAllparfumeShops,
    updateAllparfumeShopActive,
    type AllparfumeShopItem,
} from "@/lib/admin-allparfume-api";

const PER_PAGE_OPTIONS = [25, 50, 100] as const;
type PerPageOption = (typeof PER_PAGE_OPTIONS)[number];

export default function AdminAllparfumeShopsPage() {
    const [page, setPage] = useUrlPage();
    const [perPage, setPerPage] = useState<PerPageOption>(50);
    const [searchInput, setSearchInput] = useState("");
    const [activeFilter, setActiveFilter] = useState<"" | "1" | "0">("");
    const debouncedSearch = useDebouncedValue(searchInput, 350);

    const [items, setItems] = useState<AllparfumeShopItem[]>([]);
    const [meta, setMeta] = useState<{ current_page: number; last_page: number; total: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [busyId, setBusyId] = useState<number | null>(null);

    useResetPageOnChange(setPage, [debouncedSearch, activeFilter, perPage]);

    const hasActiveFilters = searchInput.trim() !== "" || activeFilter !== "";

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetchAllparfumeShops({
                search: debouncedSearch.trim() || undefined,
                is_active: activeFilter === "" ? "" : activeFilter === "1",
                page,
                per_page: perPage,
            });
            setItems(res.data);
            setMeta({
                current_page: res.current_page,
                last_page: res.last_page,
                total: res.total,
            });
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Не удалось загрузить магазины");
            setItems([]);
            setMeta(null);
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, activeFilter, page, perPage]);

    useEffect(() => {
        void load();
    }, [load]);

    const toggleActive = async (row: AllparfumeShopItem) => {
        setBusyId(row.id);
        setError("");
        try {
            const result = await updateAllparfumeShopActive(row.id, !row.is_active);
            setSuccess(result.message || (row.is_active ? "Магазин выключен" : "Магазин включён"));
            await load();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Не удалось обновить магазин");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <AdminPageCard>
            <div className="space-y-4 rounded-2xl border bg-white p-6">
                <div className="flex flex-col gap-3">
                    <p className="text-sm text-admin-text-secondary">
                        Какие магазины участвуют в «Обновить цены» и «Парсинг»
                    </p>
                    <AllparfumeAdminNav />
                </div>

                {error ? (
                    <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                ) : null}
                {success ? (
                    <AdminFeedbackMessage type="success" message={success} onCloseAction={() => setSuccess("")} />
                ) : null}

                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <AdminStatusDropdown
                            value={activeFilter}
                            onChangeAction={(v) => setActiveFilter(v as "" | "1" | "0")}
                            options={[
                                { value: "", label: "Статус" },
                                { value: "1", label: "Активные" },
                                { value: "0", label: "Выключенные" },
                            ]}
                            widthClassName="w-max shrink-0"
                            menuWidthClassName="w-max"
                        />
                        {hasActiveFilters ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearchInput("");
                                    setActiveFilter("");
                                    setPage(1);
                                }}
                                className="inline-flex h-10 shrink-0 items-center rounded-lg border border-admin-border bg-admin-surface px-3 text-xs whitespace-nowrap text-admin-text-secondary transition hover:bg-admin-muted"
                            >
                                Сбросить
                            </button>
                        ) : null}
                    </div>
                    <AdminSearchInput
                        className="w-full md:w-auto"
                        value={searchInput}
                        onChangeAction={setSearchInput}
                        placeholder="Поиск магазина"
                    />
                </div>

                {loading ? (
                    <div className="rounded-xl border px-4 py-5 text-sm text-admin-text-secondary">
                        Загрузка таблицы...
                    </div>
                ) : null}

                {!loading && items.length > 0 ? (
                    <div className="space-y-4">
                        <div className="w-full rounded-lg border bg-admin-muted px-4 py-3">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-admin-text-secondary">
                                <span className="font-medium text-admin-text">Всего: {meta?.total ?? items.length}</span>
                                <span>Активных: {items.filter((r) => r.is_active).length} на странице</span>
                            </div>
                        </div>

                        <div className="min-w-0 overflow-x-auto rounded-xl border">
                            <table className="w-full min-w-[420px] table-fixed text-sm">
                                <colgroup>
                                    <col style={{ width: "44px" }} />
                                    <col />
                                    <col style={{ width: "88px" }} />
                                </colgroup>
                                <thead className="bg-admin-muted text-admin-text-secondary">
                                    <tr>
                                        <th className="px-1.5 py-2 text-center font-medium" title="Активен">
                                            <span className="sr-only">Активен</span>
                                            ✓
                                        </th>
                                        <th className="px-3 py-2 text-left font-medium">Магазин</th>
                                        <th className="px-3 py-2 text-right font-medium">Офферов</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((row) => (
                                        <tr key={row.id} className="border-t border-admin-border">
                                            <td className="px-1.5 py-2 text-center align-middle">
                                                <input
                                                    type="checkbox"
                                                    checked={row.is_active}
                                                    disabled={busyId === row.id}
                                                    onChange={() => void toggleActive(row)}
                                                    className={adminCheckbox}
                                                    title={row.is_active ? "Активен" : "Выключен"}
                                                    aria-label={row.is_active ? "Активен" : "Выключен"}
                                                />
                                            </td>
                                            <td className="px-3 py-2">
                                                <div className="font-medium text-admin-text">{row.shop_name}</div>
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums text-admin-text-secondary">
                                                {row.offers_count}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                            <label className="flex items-center gap-2 text-sm text-admin-text-secondary">
                                На странице
                                <select
                                    value={perPage}
                                    onChange={(e) => {
                                        const v = Number(e.target.value);
                                        if (v === 25 || v === 50 || v === 100) {
                                            setPerPage(v);
                                        }
                                    }}
                                    className="rounded-lg border border-admin-border bg-admin-surface px-2 py-1.5 text-sm text-admin-text"
                                >
                                    {PER_PAGE_OPTIONS.map((n) => (
                                        <option key={n} value={n}>
                                            {n}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <AdminPagination
                                currentPage={meta?.current_page ?? 1}
                                lastPage={meta?.last_page ?? 1}
                                onPrevAction={() => setPage((p) => Math.max(1, p - 1))}
                                onNextAction={() =>
                                    setPage((p) => (meta && meta.current_page < meta.last_page ? p + 1 : p))
                                }
                            />
                        </div>
                    </div>
                ) : null}

                {!loading && items.length === 0 ? (
                    <div className="rounded-xl border px-4 py-8 text-center text-sm text-admin-text-secondary">
                        Магазинов нет. Если офферы уже есть в БД — обновите страницу; иначе сначала
                        запустите «Парсинг».
                    </div>
                ) : null}
            </div>
        </AdminPageCard>
    );
}

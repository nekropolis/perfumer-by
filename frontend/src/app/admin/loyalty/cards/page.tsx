"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import LoyaltyCardsTable from "@/components/admin/loyalty/loyalty-cards-table";
import {
    fetchAdminLoyaltyCards,
    loyaltyCardDisplayNumber,
    updateLoyaltyCard,
    type LoyaltyCardItem,
} from "@/lib/admin-loyalty-api";

export default function AdminLoyaltyCardsPage() {
    const [items, setItems] = useState<LoyaltyCardItem[]>([]);
    const [meta, setMeta] = useState<{ current_page: number; last_page: number; total: number } | null>(null);
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebouncedValue(search, 400);
    const [page, setPage] = useUrlPage();
    useResetPageOnChange(setPage, [debouncedSearch]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchAdminLoyaltyCards({ search: debouncedSearch.trim() || undefined, page });
            setItems(data.data || []);
            setMeta({
                current_page: data.current_page,
                last_page: data.last_page,
                total: data.total,
            });
        } catch (e) {
            setMessage({ type: "error", text: e instanceof Error ? e.message : "Ошибка загрузки карт" });
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, page]);

    useEffect(() => {
        void load();
    }, [load]);

    const toggleActive = async (item: LoyaltyCardItem) => {
        try {
            const st = item.status ?? (item.is_active ? "active" : "blocked");
            await updateLoyaltyCard(item.id, { status: st === "active" ? "blocked" : "active" });
            setMessage({ type: "success", text: `Карта ${loyaltyCardDisplayNumber(item)} обновлена` });
            await load();
        } catch (e) {
            setMessage({ type: "error", text: e instanceof Error ? e.message : "Ошибка обновления карты" });
        }
    };

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Накопительные карты"
                description="CRUD карт лояльности: создание, редактирование, деактивация"
                action={
                    <Link
                        href="/admin/loyalty/cards/create"
                        className="inline-flex items-center justify-center rounded-lg bg-admin-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-admin-primary-hover"
                    >
                        Создать карту
                    </Link>
                }
            >
                <AdminSearchInput value={search} onChangeAction={setSearch} placeholder="Поиск по номеру карты" />
            </AdminTableToolbar>

            {message && <AdminFeedbackMessage type={message.type} message={message.text} onCloseAction={() => setMessage(null)} />}

            {loading ? (
                <AdminLoadingState text="Загрузка накопительных карт..." />
            ) : items.length === 0 ? (
                <AdminEmptyState
                    title="Карты не найдены"
                    description="Попробуйте изменить поиск или создайте новую карту."
                />
            ) : (
                <LoyaltyCardsTable items={items} onToggleActiveAction={(item) => void toggleActive(item)} />
            )}
            <div className="mt-4">
                <AdminPagination
                    currentPage={meta?.current_page ?? 1}
                    lastPage={meta?.last_page ?? 1}
                    onPrevAction={() => setPage((p) => Math.max(1, p - 1))}
                    onNextAction={() => setPage((p) => (meta && meta.current_page < meta.last_page ? p + 1 : p))}
                />
            </div>
        </AdminPageCard>
    );
}


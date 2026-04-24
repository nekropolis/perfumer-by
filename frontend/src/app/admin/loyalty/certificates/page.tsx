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
import GiftCertificatesTable from "@/components/admin/loyalty/gift-certificates-table";
import {
    fetchAdminGiftCertificates,
    updateGiftCertificate,
    type GiftCertificateItem,
} from "@/lib/admin-loyalty-api";

export default function AdminGiftCertificatesPage() {
    const [items, setItems] = useState<GiftCertificateItem[]>([]);
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
            const data = await fetchAdminGiftCertificates({ search: debouncedSearch.trim() || undefined, page });
            setItems(data.data || []);
            setMeta({
                current_page: data.current_page,
                last_page: data.last_page,
                total: data.total,
            });
        } catch (e) {
            setMessage({ type: "error", text: e instanceof Error ? e.message : "Ошибка загрузки сертификатов" });
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, page]);

    useEffect(() => {
        void load();
    }, [load]);

    const toggleActive = async (item: GiftCertificateItem) => {
        if (item.status === "new") {
            setMessage({
                type: "error",
                text: "Заказ ещё не выполнен: после статуса «Выполнен» сертификат станет активным. Код вносит менеджер в редактировании.",
            });
            return;
        }
        try {
            await updateGiftCertificate(item.id, {
                status: item.status === "active" ? "void" : "active",
            });
            setMessage({ type: "success", text: `Сертификат ${item.code ?? `#${item.id}`} обновлён` });
            await load();
        } catch (e) {
            setMessage({ type: "error", text: e instanceof Error ? e.message : "Ошибка обновления сертификата" });
        }
    };

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Подарочные сертификаты"
                description="CRUD сертификатов: создание, редактирование, деактивация"
                action={
                    <Link
                        href="/admin/loyalty/certificates/create"
                        className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
                    >
                        Создать сертификат
                    </Link>
                }
            >
                <AdminSearchInput value={search} onChangeAction={setSearch} placeholder="Поиск по коду сертификата" />
            </AdminTableToolbar>

            {message && <AdminFeedbackMessage type={message.type} message={message.text} onCloseAction={() => setMessage(null)} />}

            {loading ? (
                <AdminLoadingState text="Загрузка сертификатов..." />
            ) : items.length === 0 ? (
                <AdminEmptyState
                    title="Сертификаты не найдены"
                    description="Попробуйте изменить поиск или создайте новый сертификат."
                />
            ) : (
                <GiftCertificatesTable items={items} onToggleActiveAction={(item) => void toggleActive(item)} />
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


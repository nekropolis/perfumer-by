"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import useDebouncedValue from "@/hooks/use-debounced-value";
import { fetchSellerOneSupplierProducts } from "@/lib/admin-vanille-api";
import { highlightAdminSearchTerms } from "@/lib/admin-search-highlight";
import { adminBtnSecondary, adminModalOverlay } from "@/lib/admin-ui-classes";
import type { SellerOneSupplierProductItem } from "@/types/Vanille";

type Props = {
    open: boolean;
    adding: boolean;
    onCloseAction: () => void;
    onSelectAction: (row: SellerOneSupplierProductItem) => void;
};

export default function SupplierDraftAddProductModal({
    open,
    adding,
    onCloseAction,
    onSelectAction,
}: Props) {
    const [mounted, setMounted] = useState(false);
    const [searchInput, setSearchInput] = useState("");
    const debouncedSearch = useDebouncedValue(searchInput, 350);
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<SellerOneSupplierProductItem[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!open) {
            return;
        }
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }

        let cancelled = false;
        const load = async () => {
            try {
                setLoading(true);
                setError(null);
                const response = await fetchSellerOneSupplierProducts({
                    search: debouncedSearch.trim() || undefined,
                    page: 1,
                });
                if (!cancelled) {
                    setItems(response.data ?? []);
                }
            } catch (err) {
                console.error(err);
                if (!cancelled) {
                    setError("Не удалось загрузить товары поставщиков");
                    setItems([]);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [open, debouncedSearch]);

    if (!open || !mounted) {
        return null;
    }

    return createPortal(
        <div className={adminModalOverlay} onClick={onCloseAction} role="presentation">
            <div
                className="flex max-h-[min(90vh,40rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-admin-border bg-admin-surface shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Добавить товар в заявку"
            >
                <div className="flex items-center justify-between gap-3 border-b border-admin-border px-4 py-3">
                    <div>
                        <div className="text-base font-semibold text-admin-text">Добавить товар</div>
                        <div className="text-xs text-admin-text-secondary">
                            Поиск по коду / названию товара поставщика (как на seller-pars)
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onCloseAction}
                        disabled={adding}
                        className={adminBtnSecondary}
                    >
                        Закрыть
                    </button>
                </div>

                <div className="border-b border-admin-border px-4 py-2">
                    <AdminSearchInput
                        value={searchInput}
                        onChangeAction={setSearchInput}
                        placeholder="Код товара поставщика"
                        syncWithUrl={false}
                    />
                </div>

                <div className="min-h-0 flex-1 overflow-auto">
                    {loading ? (
                        <div className="px-4 py-8 text-center text-sm text-admin-text-secondary">
                            Поиск…
                        </div>
                    ) : error ? (
                        <div className="px-4 py-8 text-center text-sm text-red-600">{error}</div>
                    ) : items.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-admin-text-secondary">
                            Ничего не найдено
                        </div>
                    ) : (
                        <table className="min-w-full text-sm">
                            <thead className="sticky top-0 bg-admin-muted">
                                <tr className="text-left text-xs text-admin-text-secondary">
                                    <th className="px-3 py-2 font-medium">Код</th>
                                    <th className="px-3 py-2 font-medium">Поставщик</th>
                                    <th className="px-3 py-2 font-medium">Товар поставщика</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((row) => (
                                    <tr
                                        key={row.id}
                                        className={`border-t border-admin-border/70 ${
                                            adding
                                                ? "opacity-60"
                                                : "cursor-pointer hover:bg-admin-muted/60"
                                        }`}
                                        onClick={() => {
                                            if (!adding) {
                                                onSelectAction(row);
                                            }
                                        }}
                                    >
                                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                                            {highlightAdminSearchTerms(row.code || "—", debouncedSearch)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2">
                                            {row.supplier?.name ?? "—"}
                                        </td>
                                        <td className="max-w-[20rem] truncate px-3 py-2" title={row.external_name}>
                                            {highlightAdminSearchTerms(row.external_name || "—", debouncedSearch)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}

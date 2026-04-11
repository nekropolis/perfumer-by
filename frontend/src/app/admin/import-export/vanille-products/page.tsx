"use client";

import { useEffect, useState } from "react";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminFilterSelect from "@/components/admin/ui/admin-filter-select";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import useDebouncedValue from "@/hooks/use-debounced-value";

type SupplierProductItem = {
    id: number;
    external_name: string;
    external_slug: string | null;
    external_url: string;
    is_linked: boolean;
    is_active: boolean;
    last_seen_at: string | null;
    supplier?: {
        id: number;
        name: string;
        code: string;
    } | null;
    brand?: {
        id: number;
        name: string;
    } | null;
    product?: {
        id: number;
        name: string;
        slug: string;
    } | null;
};

type ApiResponse = {
    data: SupplierProductItem[];
    current_page: number;
    last_page: number;
    total: number;
};

const LINKED_OPTIONS = [
    { value: "true", label: "Только связанные" },
    { value: "false", label: "Только новые" },
];

const ACTIVE_OPTIONS = [
    { value: "true", label: "Только активные" },
    { value: "false", label: "Только неактивные" },
];

export default function VanilleProductsPage() {
    const [items, setItems] = useState<SupplierProductItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [linked, setLinked] = useState("");
    const [active, setActive] = useState("");
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState<ApiResponse | null>(null);
    const [importingParsed, setImportingParsed] = useState(false);
    const [importResult, setImportResult] = useState<any>(null);

    const debouncedSearch = useDebouncedValue(searchInput, 400);

    const loadItems = async (targetPage = page) => {
        setLoading(true);
        setError("");

        try {
            const params = new URLSearchParams();

            if (debouncedSearch) params.set("search", debouncedSearch);
            if (linked) params.set("linked", linked);
            if (active) params.set("active", active);
            params.set("page", String(targetPage));

            const response = await fetch(
                `/api/catalog/admin/import-export/vanille/supplier-products?${params.toString()}`
            );

            const text = await response.text();

            let data: any;
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error(text || "Сервер вернул не JSON");
            }

            if (!response.ok) {
                throw new Error(data.message || "Ошибка загрузки товаров поставщика");
            }

            setItems(data.data || []);
            setMeta(data);
        } catch (e: any) {
            setError(e?.message || "Ошибка загрузки");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadItems(page);
    }, [page, debouncedSearch, linked, active]);

    const handleReset = () => {
        setSearchInput("");
        setLinked("");
        setActive("");
        setImportResult(null);
        setError("");
        setPage(1);
    };

    const handleImportParsedProducts = async () => {
        setImportingParsed(true);
        setError("");
        setImportResult(null);

        try {
            const response = await fetch("/api/catalog/admin/import-export/vanille/import-parsed-products", {
                method: "POST",
            });

            const text = await response.text();

            let data: any;
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error(text || "Сервер вернул не JSON");
            }

            if (!response.ok) {
                throw new Error(data.message || "Ошибка импорта спарсенных товаров");
            }

            setImportResult(data);
            await loadItems(1);
            setPage(1);
        } catch (e: any) {
            setError(e?.message || "Ошибка импорта спарсенных товаров");
        } finally {
            setImportingParsed(false);
        }
    };
    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Товары поставщика Vanille"
                description="Просмотр спарсенных и связанных товаров Vanille"
            >
                <AdminSearchInput
                    value={searchInput}
                    onChange={setSearchInput}
                    placeholder="Название, slug, url"
                />

                <AdminFilterSelect
                    value={linked}
                    onChange={setLinked}
                    label="Связь"
                    options={LINKED_OPTIONS}
                    placeholder="Все связи"
                />

                <AdminFilterSelect
                    value={active}
                    onChange={setActive}
                    label="Активность"
                    options={ACTIVE_OPTIONS}
                    placeholder="Все статусы"
                />

                <button
                    type="button"
                    onClick={handleReset}
                    className="rounded-xl border px-4 py-2 text-sm"
                >
                    Сбросить
                </button>

                <button
                    type="button"
                    onClick={handleImportParsedProducts}
                    disabled={importingParsed}
                    className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                >
                    {importingParsed ? "Импорт..." : "Импортировать спарсенные товары"}
                </button>
            </AdminTableToolbar>

            {error && (
                <AdminFeedbackMessage
                    type="error"
                    message={error}
                    onCloseAction={() => setError("")}
                />
            )}

            {importResult && (
                <div className="mb-6 rounded-2xl border bg-gray-50 p-4 space-y-4">
                    <div className="text-sm font-medium">Результат импорта</div>

                    {importResult.message ? (
                        <div className="text-sm text-gray-700">{importResult.message}</div>
                    ) : null}

                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <div className="rounded-xl border bg-white p-3 text-sm">
                            <div className="text-gray-500">Imported</div>
                            <div className="text-lg font-semibold">{importResult.imported || 0}</div>
                        </div>

                        <div className="rounded-xl border bg-white p-3 text-sm">
                            <div className="text-gray-500">Updated</div>
                            <div className="text-lg font-semibold">{importResult.updated || 0}</div>
                        </div>

                        <div className="rounded-xl border bg-white p-3 text-sm">
                            <div className="text-gray-500">Errors</div>
                            <div className="text-lg font-semibold">{importResult.errors || 0}</div>
                        </div>

                        <div className="rounded-xl border bg-white p-3 text-sm">
                            <div className="text-gray-500">Items</div>
                            <div className="text-lg font-semibold">{importResult.items || 0}</div>
                        </div>
                    </div>
                    {Array.isArray(importResult.log) && importResult.log.length > 0 ? (
                        <div className="rounded-xl border bg-white p-3">
                            <div className="mb-2 text-sm font-medium">Лог</div>
                            <div className="space-y-1 text-sm text-gray-700 max-h-80 overflow-y-auto">
                                {importResult.log.map((line: string, index: number) => (
                                    <div key={index}>{line}</div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            )}

            {loading && <AdminLoadingState text="Загрузка товаров поставщика..." />}

            {!loading && items.length === 0 && (
                <AdminEmptyState
                    title="Товары не найдены"
                    description="Попробуйте изменить поиск или фильтры."
                />
            )}
            {!loading && items.length > 0 &&
                (
                    <div className="space-y-4">
                        <div className="text-sm text-gray-500">
                            Всего: {meta?.total ?? items.length}
                        </div>

                        <div className="overflow-x-auto rounded-xl border">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50">
                                <tr className="text-left">
                                    <th className="px-4 py-3">ID</th>
                                    <th className="px-4 py-3">Внешний товар</th>
                                    <th className="px-4 py-3">Бренд</th>
                                    <th className="px-4 py-3">Локальный товар</th>
                                    <th className="px-4 py-3">Связь</th>
                                    <th className="px-4 py-3">Активность</th>
                                    <th className="px-4 py-3">Последний раз видели</th>
                                </tr>
                                </thead>
                                <tbody>
                                {items.map((item) => (
                                    <tr key={item.id} className="border-t align-top">
                                        <td className="px-4 py-3">{item.id}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{item.external_name}</div>
                                            <div className="text-xs text-gray-500">{item.external_slug}</div>
                                            <a
                                                href={item.external_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-xs text-blue-600 hover:underline"
                                            >
                                                открыть источник
                                            </a>
                                        </td>
                                        <td className="px-4 py-3">
                                            {item.brand ? item.brand.name : "—"}
                                        </td>
                                        <td className="px-4 py-3">
                                            {item.product ? (
                                                <div>
                                                    <div className="font-medium">{item.product.name}</div>
                                                    <div className="text-xs text-gray-500">{item.product.slug}</div>
                                                </div>
                                            ) : (
                                                "—"
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {item.is_linked ? (
                                                <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
                                                    linked
                                                </span>
                                            ) : (
                                                <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs text-yellow-700">
                                                    new
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {item.is_active ? (
                                                <span className="rounded-full bg-green-100 px-2 py-1 text-
xs text-green-700">
                                                    active
                                                </span>
                                            ) : (
                                                <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                                                    inactive
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">{item.last_seen_at || "—"}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={!meta || meta.current_page <= 1}
                                className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                            >
                                Назад
                            </button>

                            <div className="text-sm text-gray-500">
                                Страница {meta?.current_page ?? 1} из {meta?.last_page ?? 1}
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    setPage((p) =>
                                        meta && meta.current_page < meta.last_page ? p + 1 : p
                                    )
                                }
                                disabled={!meta || meta.current_page >= meta.last_page}
                                className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                            >
                                Вперёд
                            </button>
                        </div>
                    </div>
                )}
        </AdminPageCard>
    );
}

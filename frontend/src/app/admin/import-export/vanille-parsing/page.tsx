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
import AdminPagination from "@/components/admin/ui/admin-pagination";
import {
    ApiResponse,
    ImportResponse,
    SupplierProductItem,
    VanilleParseResponse,
} from "@/types/Vanille";

import {
    collectVanilleProductLinks,
    fetchVanilleSupplierProducts,
    importParsedVanilleProducts,
    parseVanilleBrands,
    parseVanilleProducts,
} from "@/lib/admin-vanille-api";


const LINKED_OPTIONS = [
    {value: "true", label: "Только связанные"},
    {value: "false", label: "Только новые"},
];

const ACTIVE_OPTIONS = [
    {value: "true", label: "Только активные"},
    {value: "false", label: "Только неактивные"},
];

function DismissibleAlert({
                              message,
                              onCloseAction,
                          }: {
    message: string;
    onCloseAction: () => void;
}) {
    return (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1">{message}</div>

                <button
                    type="button"
                    onClick={onCloseAction}
                    className="shrink-0 text-xs opacity-60 transition hover:opacity-100"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}

function VanilleResultCard({
                               title,
                               result,
                               onCloseAction,
                               scrollableLog = false,
                           }: {
    title: string;
    result: {
        message?: string;
        imported?: number;
        updated?: number;
        errors?: number;
        items?: number;
        log?: string[];
    };
    onCloseAction: () => void;
    scrollableLog?: boolean;
}) {
    return (
        <div className="rounded-2xl border bg-gray-50 p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium">{title}</div>

                <button
                    type="button"
                    onClick={onCloseAction}
                    className="shrink-0 text-xs text-gray-500 opacity-60 transition hover:opacity-100"
                >
                    ✕
                </button>
            </div>

            {result.message ? (
                <div className="text-sm text-gray-700">{result.message}</div>
            ) : null}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-xl border bg-white p-3 text-sm">
                    <div className="text-gray-500">Imported</div>
                    <div className="text-lg font-semibold">{result.imported || 0}</div>
                </div>

                <div className="rounded-xl border bg-white p-3 text-sm">
                    <div className="text-gray-500">Updated</div>
                    <div className="text-lg font-semibold">{result.updated || 0}</div>
                </div>

                <div className="rounded-xl border bg-white p-3 text-sm">
                    <div className="text-gray-500">Errors</div>
                    <div className="text-lg font-semibold">{result.errors || 0}</div>
                </div>

                <div className="rounded-xl border bg-white p-3 text-sm">
                    <div className="text-gray-500">Items</div>
                    <div className="text-lg font-semibold">{result.items || 0}</div>
                </div>
            </div>

            {Array.isArray(result.log) && result.log.length > 0 ? (
                <div className="rounded-xl border bg-white p-3">
                    <div className="mb-2 text-sm font-medium">Лог</div>
                    <div
                        className={`space-y-1 text-sm text-gray-700 ${scrollableLog ? "max-h-80 overflow-y-auto" : ""}`}>
                        {result.log.map((line, index) => (
                            <div key={index}>{line}</div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

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
    const [importResult, setImportResult] = useState<ImportResponse | null>(null);

    const [parsingError, setParsingError] = useState("");
    const [parsingResult, setParsingResult] = useState<VanilleParseResponse | null>(null);
    const [parsingBrands, setParsingBrands] = useState(false);
    const [collectingLinks, setCollectingLinks] = useState(false);
    const [parsingProducts, setParsingProducts] = useState(false);

    const debouncedSearch = useDebouncedValue(searchInput, 400);

    const loadItems = async (targetPage = page) => {
        setLoading(true);
        setError("");

        try {
            const data = await fetchVanilleSupplierProducts({
                search: debouncedSearch || undefined,
                linked: linked || undefined,
                active: active || undefined,
                page: targetPage,
            });

            setItems(data.data || []);
            setMeta(data);
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message : "Ошибка загрузки");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadItems(page);
    }, [page, debouncedSearch, linked, active]);


    const handleImportParsedProducts = async () => {
        setImportingParsed(true);
        setError("");
        setImportResult(null);

        try {
            const data = await importParsedVanilleProducts();

            setImportResult(data);
            await loadItems(1);
            setPage(1);
        } catch (e: unknown) {
            setError(
                e instanceof Error
                    ? e.message : "Ошибка импорта спарсенных товаров");
        } finally {
            setImportingParsed(false);
        }
    };
    // Parsing logic and UI


    const handleParseBrands = async () => {
        setParsingBrands(true);
        setParsingError("");
        setParsingResult(null);

        try {
            const data = await parseVanilleBrands();

            setParsingResult(data);
        } catch (e: unknown) {
            setParsingError(
                e instanceof Error
                    ? e.message
                    : "Ошибка парсинга брендов"
            );
        } finally {
            setParsingBrands(false);
        }
    };

    const handleCollectLinks = async () => {
        setCollectingLinks(true);
        setParsingError("");
        setParsingResult(null);

        try {
            const data = await collectVanilleProductLinks();

            setParsingResult(data);
        } catch (e: unknown) {
            setParsingError(
                e instanceof Error
                    ? e.message
                    : "Ошибка сбора ссылок"
            );
        } finally {
            setCollectingLinks(false);
        }
    };

    const handleParseProducts = async () => {
        setParsingProducts(true);
        setParsingError("");
        setParsingResult(null);

        try {
            const data = await parseVanilleProducts();

            setParsingResult(data);
        } catch (e: unknown) {
            setParsingError(
                e instanceof Error
                    ? e.message
                    : "Ошибка массового парсинга карточек"
            );
        } finally {
            setParsingProducts(false);
        }
    };

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Товары поставщика Vanille"
                description="Просмотр спарсенных и связанных товаров Vanille"
                action={
                    <button
                        type="button"
                        onClick={handleImportParsedProducts}
                        disabled={importingParsed}
                        className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                    >
                        {importingParsed ? "Импорт..." : "Импортировать спарсенные товары"}
                    </button>
                }
            >
                <div className="w-full space-y-4">
                    <div className="rounded-2xl border bg-white p-6 space-y-4">
                        <div className="flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={handleParseBrands}
                                disabled={parsingBrands}
                                className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                            >
                                {parsingBrands ? "Парсинг..." : "Парсинг брендов"}
                            </button>

                            <button
                                type="button"
                                onClick={handleCollectLinks}
                                disabled={collectingLinks}
                                className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                            >
                                {collectingLinks ? "Сбор..." : "Сбор ссылок товаров"}
                            </button>

                            <button
                                type="button"
                                onClick={handleParseProducts}
                                disabled={parsingProducts}
                                className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                            >
                                {parsingProducts ? "Парсинг..." : "Массовый парсинг карточек"}
                            </button>
                        </div>

                        {parsingError ? (
                            <DismissibleAlert
                                message={parsingError}
                                onCloseAction={() => setParsingError("")}
                            />
                        ) : null}

                        {parsingResult ? (
                            <VanilleResultCard
                                title="Результат"
                                result={parsingResult}
                                onCloseAction={() => setParsingResult(null)}
                            />
                        ) : null}
                    </div>

                    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between">
                        <AdminSearchInput
                            value={searchInput}
                            onChangeAction={setSearchInput}
                            placeholder="Название, slug, url"
                        />

                        <AdminFilterSelect
                            value={linked}
                            onChangeAction={setLinked}
                            options={LINKED_OPTIONS}
                            placeholder="Все связи"
                        />

                        <AdminFilterSelect
                            value={active}
                            onChangeAction={setActive}
                            options={ACTIVE_OPTIONS}
                            placeholder="Все статусы"
                        />
                    </div>
                </div>
            </AdminTableToolbar>

            {error && (
                <AdminFeedbackMessage
                    type="error"
                    message={error}
                    onCloseAction={() => setError("")}
                />
            )}

            {importResult ? (
                <div className="mb-6">
                    <VanilleResultCard
                        title="Результат импорта"
                        result={importResult}
                        onCloseAction={() => setImportResult(null)}
                        scrollableLog
                    />
                </div>
            ) : null}

            {loading && <AdminLoadingState text="Загрузка товаров поставщика..."/>}

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
                                                <span
                                                    className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
                                                    linked
                                                </span>
                                            ) : (
                                                <span
                                                    className="rounded-full bg-yellow-100 px-2 py-1 text-xs text-yellow-700">
                                                    new
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {item.is_active ? (
                                                <span
                                                    className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
                                                    active
                                                </span>
                                            ) : (
                                                <span
                                                    className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
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

                        <AdminPagination
                            currentPage={meta?.current_page ?? 1}
                            lastPage={meta?.last_page ?? 1}
                            onPrevAction={() => setPage((p) => Math.max(1, p - 1))}
                            onNextAction={() =>
                                setPage((p) =>
                                    meta && meta.current_page < meta.last_page ? p + 1 : p
                                )
                            }
                        />

                    </div>
                )}
        </AdminPageCard>
    );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminFilterSelect from "@/components/admin/ui/admin-filter-select";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import {
    ApiResponse,
    SupplierProductItem,
    VanilleImportQueueJob,
} from "@/types/Vanille";

import {
    fetchVanilleParseStatus,
    fetchVanilleSupplierProducts,
    importParsedVanilleProducts,
    parseSingleVanilleProductUrl,
    startVanillePipelineNewProducts,
    startVanillePipelineRefreshAll,
} from "@/lib/admin-vanille-api";


const LINKED_OPTIONS = [
    {value: "true", label: "Только связанные"},
    {value: "false", label: "Только новые"},
];

const ACTIVE_OPTIONS = [
    {value: "true", label: "Только активные"},
    {value: "false", label: "Только неактивные"},
];

function DismissibleSuccessBanner({
    message,
    onCloseAction,
}: {
    message: string;
    onCloseAction: () => void;
}) {
    return (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
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

export default function VanilleProductsPage() {
    const searchParamsFromUrl = useSearchParams();

    const [items, setItems] = useState<SupplierProductItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchInput, setSearchInput] = useState(
        () => searchParamsFromUrl.get("search") ?? "",
    );
    const [linked, setLinked] = useState("");
    const [active, setActive] = useState("");
    const [page, setPage] = useUrlPage();
    const [meta, setMeta] = useState<ApiResponse | null>(null);
    const [importingParsed, setImportingParsed] = useState(false);
    const [singleUrlInput, setSingleUrlInput] = useState("");
    const [singleUrlBusy, setSingleUrlBusy] = useState(false);

    const [parsingError, setParsingError] = useState("");
    const [parseJob, setParseJob] = useState<VanilleImportQueueJob | null>(null);
    const [parseStatusLoading, setParseStatusLoading] = useState(true);
    const previousParseStatusRef = useRef<string | null>(null);
    const completionBannerConsumedRef = useRef(false);

    const [completionNotice, setCompletionNotice] = useState("");

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

    useResetPageOnChange(setPage, [debouncedSearch, linked, active]);

    useEffect(() => {
        void loadItems(page);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, debouncedSearch, linked, active]);

    const loadParseStatus = async () => {
        try {
            const data = await fetchVanilleParseStatus();
            const job = data.data || null;
            const prevStatus = previousParseStatusRef.current;

            setParseJob(job);

            if (job && ["pending", "running"].includes(job.status)) {
                completionBannerConsumedRef.current = false;
                setCompletionNotice("");
            } else if (
                job === null
                && (prevStatus === "running" || prevStatus === "pending")
            ) {
                if (!completionBannerConsumedRef.current) {
                    setCompletionNotice("Задача завершена. Подробности смотрите в Система -> Аудит.");
                    completionBannerConsumedRef.current = true;
                }
                void loadItems(1);
                setPage(1);
            }

            if (
                job?.status === "failed"
                && ["pending", "running"].includes(prevStatus || "")
            ) {
                setParsingError(job.error || "Ошибка фонового парсинга");
            }

            previousParseStatusRef.current = job?.status ?? null;
        } catch (e: unknown) {
            setParsingError(e instanceof Error ? e.message : "Ошибка загрузки статуса парсинга");
        } finally {
            setParseStatusLoading(false);
        }
    };

    useEffect(() => {
        void loadParseStatus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!parseJob || !["pending", "running"].includes(parseJob.status)) {
            return;
        }

        const timer = setInterval(() => {
            void loadParseStatus();
        }, 3000);

        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parseJob]);

    const hasActiveParse = !!parseJob && ["pending", "running"].includes(parseJob.status);


    const handleImportParsedProducts = async () => {
        setImportingParsed(true);
        setParsingError("");
        setCompletionNotice("");
        completionBannerConsumedRef.current = false;

        try {
            const data = await importParsedVanilleProducts();
            setParseJob(data.job);
        } catch (e: unknown) {
            setParsingError(
                e instanceof Error
                    ? e.message : "Ошибка импорта спарсенных товаров");
        } finally {
            setImportingParsed(false);
        }
    };
    // Parsing logic and UI


    const handlePipelineNewProducts = async () => {
        setParsingError("");
        setCompletionNotice("");
        completionBannerConsumedRef.current = false;

        try {
            const data = await startVanillePipelineNewProducts();
            setParseJob(data.job);
        } catch (e: unknown) {
            setParsingError(
                e instanceof Error
                    ? e.message
                    : "Ошибка запуска парсинга новых товаров"
            );
        }
    };

    const handlePipelineRefreshAll = async () => {
        const confirmed = window.confirm(
            [
                "Спарсить все товары заново?",
                "",
                "Будет обновлено:",
                "• название, h1, бренд, атрибуты, структура вариантов (добавятся недостающие варианты)",
                "",
                "Не будет затронуто у уже созданных товаров:",
                "• наличие",
                "• цена",
                "• описание",
                "• краткое описание",
                "• SEO-блоки (title/description и др.)",
            ].join("\n")
        );
        if (!confirmed) {
            return;
        }

        setParsingError("");
        setCompletionNotice("");
        completionBannerConsumedRef.current = false;

        try {
            const data = await startVanillePipelineRefreshAll();
            setParseJob(data.job);
        } catch (e: unknown) {
            setParsingError(
                e instanceof Error
                    ? e.message
                    : "Ошибка запуска репарса всех карточек"
            );
        }
    };

    const handleParseSingleUrl = async () => {
        const url = singleUrlInput.trim();
        if (!url) {
            setParsingError("Введите URL или slug товара vanille.by");
            return;
        }
        setSingleUrlBusy(true);
        setParsingError("");
        setCompletionNotice("");

        try {
            const data = await parseSingleVanilleProductUrl(url);
            const d = data.data;
            const extra =
                d && d.offers_count === 0
                    ? " Вариантов (offers) на странице не найдено — товар может быть без цен/в ожидании; импорт всё равно создаст карточку без вариантов."
                    : "";
            setCompletionNotice(
                (data.message || "Готово.") +
                    (d?.file ? ` Файл: ${d.file}.` : "") +
                    extra
            );
            setSingleUrlInput("");
            void loadItems(1);
        } catch (e: unknown) {
            setParsingError(
                e instanceof Error ? e.message : "Ошибка парсинга по URL"
            );
        } finally {
            setSingleUrlBusy(false);
        }
    };

    return (
        <AdminPageCard>
            <>
            {completionNotice ? (
                <div className="mb-4">
                    <DismissibleSuccessBanner
                        message={completionNotice}
                        onCloseAction={() => {
                            setCompletionNotice("");
                            completionBannerConsumedRef.current = true;
                        }}
                    />
                </div>
            ) : null}

            <AdminTableToolbar
                title="Товары поставщика Vanille"
                description="Просмотр спарсенных и связанных товаров Vanille"
                action={
                    <button
                        type="button"
                        onClick={handleImportParsedProducts}
                        disabled={importingParsed || hasActiveParse}
                        className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                    >
                        {importingParsed
                            ? "Запуск..."
                            : hasActiveParse && parseJob?.type === "import_parsed_products"
                                ? "Импорт выполняется..."
                                : "Импортировать спарсенные товары"}
                    </button>
                }
            >
                <div className="w-full space-y-4">
                    <div className="rounded-2xl border bg-white p-6 space-y-4">
                        <div className="flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={handlePipelineNewProducts}
                                disabled={hasActiveParse}
                                className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                            >
                                {hasActiveParse && parseJob?.type === "pipeline_new_products"
                                    ? "Выполняется..."
                                    : "Парсинг нового товара"}
                            </button>

                            <button
                                type="button"
                                onClick={handlePipelineRefreshAll}
                                disabled={hasActiveParse}
                                className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                            >
                                {hasActiveParse && parseJob?.type === "pipeline_refresh_all"
                                    ? "Выполняется..."
                                    : "Спарсить все товары заново"}
                            </button>
                        </div>

                        <p className="text-xs text-gray-600">
                            «Парсинг нового товара» только скачивает карточки в JSON. Чтобы появились в каталоге,
                            после завершения нажмите «Импортировать спарсенные товары». Режим «новые» теперь
                            считает новыми только URL без привязанного товара в базе (раньше URL пропадал из очереди
                            после одного парсинга без импорта).
                        </p>

                        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50/80 p-3 sm:flex-row sm:items-center">
                            <input
                                type="text"
                                value={singleUrlInput}
                                onChange={(e) => setSingleUrlInput(e.target.value)}
                                placeholder="https://vanille.by/slug или только slug"
                                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                                disabled={singleUrlBusy}
                            />
                            <button
                                type="button"
                                onClick={() => void handleParseSingleUrl()}
                                disabled={singleUrlBusy}
                                className="shrink-0 rounded-lg border bg-white px-4 py-2 text-sm disabled:opacity-50"
                            >
                                {singleUrlBusy ? "Парсинг…" : "Спарсить только этот URL"}
                            </button>
                        </div>

                        {parseStatusLoading ? null : parseJob ? (
                            <div className="rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-700">
                                <div className="font-medium">
                                    Статус: {parseJob.message || "Задача парсинга"}
                                </div>
                                <div className="mt-1 text-xs text-gray-500">
                                    Состояние: {parseJob.status} · Прогресс: {parseJob.progress ?? 0}%
                                </div>
                                {hasActiveParse ? (
                                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                                        <div
                                            className="h-full rounded-full bg-black transition-all"
                                            style={{ width: `${Math.max(0, Math.min(100, parseJob.progress ?? 0))}%` }}
                                        />
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        {parsingError ? (
                            <DismissibleAlert
                                message={parsingError}
                                onCloseAction={() => setParsingError("")}
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
            </>
        </AdminPageCard>
    );
}

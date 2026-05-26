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
    parseVanilleCatalogImages,
    parseVanilleProductImages,
    rewriteVanilleDescriptions,
    startVanillePipelineNewProducts,
    startVanillePipelineRefreshAll,
    vanilleSingleUrlMediaFollowUp,
} from "@/lib/admin-vanille-api";
import Link from "next/link";


const LINKED_OPTIONS = [
    { value: "true", label: "Только связанные" },
    { value: "false", label: "Только новые" },
];

const ACTIVE_OPTIONS = [
    { value: "true", label: "Только активные" },
    { value: "false", label: "Только неактивные" },
];

function confirmVanilleAction(message: string): boolean {
    return window.confirm(message);
}

const VANILLE_CONFIRM = {
    importParsed: [
        "Импортировать спарсенные товары в каталог?",
        "",
        "Будут созданы новые товары и обновлены существующие (характеристики, недостающие варианты).",
        "Цены, наличие, описания и SEO у уже созданных товаров не перезаписываются.",
    ].join("\n"),
    pipelineNew: [
        "Запустить «Парсинг нового товара»?",
        "",
        "Будут выполнены: бренды → сбор ссылок → парсинг только новых и неуспешных карточек в JSON.",
        "Импорт в каталог — отдельной кнопкой «Импортировать спарсенные товары».",
    ].join("\n"),
    catalogImages: [
        "Запустить «Каталожные фото (листинг)»?",
        "",
        "Фоновая задача для всех связанных товаров Vanille.",
    ].join("\n"),
    productImages: [
        "Запустить «Галерея карточек»?",
        "",
        "Фоновая задача для всех связанных товаров Vanille.",
    ].join("\n"),
    descriptions: [
        "Запустить «Уникализация описаний» (LLM)?",
        "",
        "Фоновая задача, может занять много времени.",
    ].join("\n"),
} as const;

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
    /** После успешного импорта по URL — те же фоновые задачи, что и кнопки выше (весь каталог). */
    const [singleUrlChainCatalog, setSingleUrlChainCatalog] = useState(false);
    const [singleUrlChainGallery, setSingleUrlChainGallery] = useState(false);
    const [singleUrlChainDescriptions, setSingleUrlChainDescriptions] = useState(false);

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
        if (!confirmVanilleAction(VANILLE_CONFIRM.importParsed)) {
            return;
        }

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
        if (!confirmVanilleAction(VANILLE_CONFIRM.pipelineNew)) {
            return;
        }

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

    const enqueueMediaJob = async (
        fn: () => Promise<{ job: VanilleImportQueueJob }>,
        label: string,
        confirmMessage: string,
    ) => {
        if (!confirmVanilleAction(confirmMessage)) {
            return;
        }

        setParsingError("");
        setCompletionNotice("");
        completionBannerConsumedRef.current = false;
        try {
            const data = await fn();
            setParseJob(data.job);
        } catch (e: unknown) {
            setParsingError(e instanceof Error ? e.message : label);
        }
    };

    const handlePipelineRefreshAll = async () => {
        const confirmed = confirmVanilleAction(
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

        const chainCatalog = singleUrlChainCatalog;
        const chainGallery = singleUrlChainGallery;
        const chainDescriptions = singleUrlChainDescriptions;

        const followUp: string[] = [];
        if (chainCatalog) {
            followUp.push("каталожные фото (листинг)");
        }
        if (chainGallery) {
            followUp.push("галерея карточек");
        }
        if (chainDescriptions) {
            followUp.push("уникализация описаний");
        }

        const singleConfirm = [
            "Спарсить и импортировать один товар?",
            "",
            `URL: ${url}`,
            followUp.length > 0
                ? `\nДополнительно после импорта: ${followUp.join(", ")}.`
                : "",
        ].join("\n");

        if (!confirmVanilleAction(singleConfirm)) {
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
            const imp = d?.import;
            let importLine = "";
            if (
                imp &&
                typeof imp.imported === "number" &&
                typeof imp.updated === "number" &&
                (imp.success === true || imp.imported > 0 || imp.updated > 0)
            ) {
                importLine = ` В каталоге: новых ${imp.imported}, обновлено ${imp.updated}.`;
            }
            const importOk =
                !!imp &&
                (imp.success === true ||
                    (typeof imp.imported === "number" && imp.imported > 0) ||
                    (typeof imp.updated === "number" && imp.updated > 0));

            let notice =
                (data.message || "Готово.") +
                (d?.file ? ` Файл: ${d.file}.` : "") +
                importLine +
                extra;

            if (
                importOk &&
                (chainCatalog || chainGallery || chainDescriptions)
            ) {
                try {
                    const followUp = await vanilleSingleUrlMediaFollowUp({
                        url,
                        catalog: chainCatalog,
                        gallery: chainGallery,
                        descriptions: chainDescriptions,
                    });
                    if (followUp.message) {
                        notice += ` ${followUp.message}`;
                    }
                } catch (chainErr: unknown) {
                    setParsingError(
                        chainErr instanceof Error
                            ? chainErr.message
                            : "Ошибка дополнительных шагов для этого товара"
                    );
                    void loadItems(1);
                    return;
                }
            }

            setCompletionNotice(notice);
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

                                <button
                                    type="button"
                                    onClick={() =>
                                        void enqueueMediaJob(
                                            parseVanilleCatalogImages,
                                            "Каталожные изображения",
                                            VANILLE_CONFIRM.catalogImages,
                                        )
                                    }
                                    disabled={hasActiveParse}
                                    className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                                >
                                    {hasActiveParse && parseJob?.type === "parse_catalog_images"
                                        ? "Каталог…"
                                        : "Каталожные фото (листинг)"}
                                </button>

                                <button
                                    type="button"
                                    onClick={() =>
                                        void enqueueMediaJob(
                                            parseVanilleProductImages,
                                            "Галерея карточек",
                                            VANILLE_CONFIRM.productImages,
                                        )
                                    }
                                    disabled={hasActiveParse}
                                    className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                                >
                                    {hasActiveParse && parseJob?.type === "parse_product_images"
                                        ? "Галерея…"
                                        : "Галерея карточек"}
                                </button>

                                <button
                                    type="button"
                                    onClick={() =>
                                        void enqueueMediaJob(
                                            rewriteVanilleDescriptions,
                                            "Описания",
                                            VANILLE_CONFIRM.descriptions,
                                        )
                                    }
                                    disabled={hasActiveParse}
                                    className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                                >
                                    {hasActiveParse && parseJob?.type === "rewrite_descriptions"
                                        ? "Описания…"
                                        : "Уникализация описаний"}
                                </button>

                                <Link
                                    href="/admin/import-export/retry-queue"
                                    className="inline-flex items-center rounded-xl border border-dashed border-gray-400 px-4 py-2 text-sm text-admin-text hover:bg-admin-muted"
                                >
                                    Очередь ошибок
                                </Link>
                            </div>

                            <p className="text-xs text-admin-text-secondary">
                                «Парсинг нового товара» и «Спарсить все товары заново» только скачивает карточки в JSON. Чтобы товары появились в каталоге,
                                после завершения нажмите «Импортировать спарсенные товары».
                            </p>

                            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-gray-300 bg-admin-muted/80 p-3">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <input
                                        type="text"
                                        value={singleUrlInput}
                                        onChange={(e) => setSingleUrlInput(e.target.value)}
                                        placeholder="https://vanille.by/slug или только slug"
                                        className="min-w-0 flex-1 rounded-lg border border-admin-border bg-white px-3 py-2 text-sm"
                                        disabled={singleUrlBusy || hasActiveParse}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => void handleParseSingleUrl()}
                                        disabled={singleUrlBusy || hasActiveParse}
                                        className="shrink-0 rounded-lg border bg-white px-4 py-2 text-sm disabled:opacity-50"
                                    >
                                        {singleUrlBusy
                                            ? "Парсинг и импорт…"
                                            : hasActiveParse
                                                ? "Дождитесь задачи…"
                                                : "Спарсить и импортировать товар"}
                                    </button>
                                </div>

                                <p className="text-[11px] leading-snug text-admin-text-secondary">
                                    Введите URL или slug товара vanille.by и нажмите «Спарсить и импортировать товар». Перед парсингом можно выбрать опциональные действия для этого товара.
                                </p>

                                <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-admin-text">
                                    <label className="inline-flex cursor-pointer items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={singleUrlChainCatalog}
                                            onChange={(e) => setSingleUrlChainCatalog(e.target.checked)}
                                            disabled={singleUrlBusy || hasActiveParse}
                                            className="rounded border-gray-300"
                                        />
                                        Затем: каталожные фото (листинг)
                                    </label>
                                    <label className="inline-flex cursor-pointer items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={singleUrlChainGallery}
                                            onChange={(e) => setSingleUrlChainGallery(e.target.checked)}
                                            disabled={singleUrlBusy || hasActiveParse}
                                            className="rounded border-gray-300"
                                        />
                                        Затем: галерея карточек
                                    </label>
                                    <label className="inline-flex cursor-pointer items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={singleUrlChainDescriptions}
                                            onChange={(e) => setSingleUrlChainDescriptions(e.target.checked)}
                                            disabled={singleUrlBusy || hasActiveParse}
                                            className="rounded border-gray-300"
                                        />
                                        Затем: уникализация описаний
                                    </label>
                                </div>
                            </div>

                            {parseStatusLoading ? null : parseJob ? (
                                <div className="rounded-xl border bg-admin-muted px-4 py-3 text-sm text-admin-text">
                                    <div className="font-medium">
                                        Статус: {parseJob.message || "Задача парсинга"}
                                    </div>
                                    <div className="mt-1 text-xs text-admin-text-secondary">
                                        Состояние: {parseJob.status} · Прогресс: {parseJob.progress ?? 0}%
                                    </div>
                                    {hasActiveParse ? (
                                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                                            <div
                                                className="h-full rounded-full bg-admin-primary transition-all"
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
                            <div className="text-sm text-admin-text-secondary">
                                Всего: {meta?.total ?? items.length}
                            </div>

                            <div className="overflow-x-auto rounded-xl border">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-admin-muted">
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
                                                    <div className="text-xs text-admin-text-secondary">{item.external_slug}</div>
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
                                                            <div className="text-xs text-admin-text-secondary">{item.product.slug}</div>
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
                                                            className="rounded-full bg-gray-100 px-2 py-1 text-xs text-admin-text">
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

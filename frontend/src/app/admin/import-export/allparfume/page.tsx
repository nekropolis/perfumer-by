"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminSearchableSelect from "@/components/admin/ui/admin-searchable-select";
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import AllparfumeAdminNav from "@/components/admin/import-export/allparfume-admin-nav";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import { adminBtnSecondary, adminCheckbox } from "@/lib/admin-ui-classes";
import { highlightAdminSearchTerms } from "@/lib/admin-search-highlight";

const PER_PAGE_OPTIONS = [25, 50, 100] as const;
type PerPageOption = (typeof PER_PAGE_OPTIONS)[number];
const PER_PAGE_STORAGE_KEY = "admin-allparfume-per-page";

function parsePerPage(raw: string | null | undefined): PerPageOption {
    const value = Number(raw);
    if (value === 25 || value === 50 || value === 100) {
        return value;
    }
    return 50;
}

function readStoredPerPage(): PerPageOption {
    if (typeof window === "undefined") {
        return 50;
    }
    return parsePerPage(window.localStorage.getItem(PER_PAGE_STORAGE_KEY));
}

function normalizeImportedPerfumerUrl(value: unknown): string | string[] | null {
    if (typeof value === "string") {
        const url = value.trim();
        return url !== "" ? url : null;
    }
    if (!Array.isArray(value)) {
        return null;
    }
    const urls = value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item !== "");
    return urls.length > 0 ? urls : null;
}

import {
    fetchAllparfumeBrands,
    fetchAllparfumeSyncActive,
    fetchAllparfumeSyncStatus,
    fetchAllparfumeVariants,
    forceLinkAllparfumeVariant,
    resetAllparfumeVariantLink,
    runAllparfumeAutoMatch,
    startAllparfumeFullSync,
    startAllparfumeRefreshPrices,
    importAllparfumeIds,
    formatAllparfumeUpdatedAt,
    type AllparfumeBrandOption,
    type AllparfumeSyncJobStatus,
    type AllparfumeVariantItem,
    type AllparfumeVariantsResponse,
} from "@/lib/admin-allparfume-api";
import { fetchProductLinkSearch, type ProductAdminItem } from "@/lib/admin-products-api";
import {
    createProductVariant,
    fetchProductVariants,
    fetchVariantDefinitions,
} from "@/lib/admin-product-variants-api";
import {
    SELLER_ONE_DEFINITION_SEARCH_DEBOUNCE_MS,
    SELLER_ONE_PRODUCT_SEARCH_DEBOUNCE_MS,
} from "@/components/admin/import-export/seller-one/constants";
import {
    buildDefinitionSearchFromHint,
    buildInitialSearchFromRow,
    canConfirmSuggestedLink,
    findSellerOneRowNameMatchInfo,
    formatCatalogProductLabel,
    getRowCatalogProductLabel,
    getSuggestedProductOnlyMessage,
    getVariantMatchFlags,
    isFullVariantMatch,
    isSimilarProductMatch,
    variantMatchesVolumeHint,
} from "@/components/admin/import-export/seller-one/utils";
import { type ManualLinkState } from "@/components/admin/import-export/seller-one/types";
import {
    AlertMessage,
    ConfidenceBadge,
    HighlightedNameText,
    ManualLinkModal,
    SuccessMessage,
} from "@/components/admin/import-export/seller-one/ui";
import type { SellerOneSupplierProductItem } from "@/types/Vanille";

const STATUS_OPTIONS = [
    { value: "confirmed", label: "Связанные" },
    { value: "found_unconfirmed", label: "Есть кандидат" },
    { value: "unlinked", label: "Не связанные" },
] as const;

function confirmAllparfumeAction(message: string): boolean {
    return window.confirm(message);
}

const ALLPARFUME_CONFIRM = {
    refreshPrices: [
        "Запустить «Обновить цены»?",
        "",
        "Будут обновлены цены и офферы только у уже сохранённых после парсинга товаров Allparfume.",
        "Новые товары/варианты с сайта не создаются.",
        "Задача пойдёт в очередь — прогресс на странице и в шапке.",
    ].join("\n"),
    syncAll: [
        "Запустить «Парсинг»?",
        "",
        "Пройдёт по всем брендам allparfume.by.",
        "Новые товары, варианты и офферы будут созданы; существующие — обновлены.",
        "Может занять очень долго. Задача пойдёт в очередь.",
    ].join("\n"),
    autoMatch: [
        "Запустить автоматчинг?",
        "",
        "Будут сопоставлены варианты Allparfume с каталогом.",
    ].join("\n"),
} as const;

type StatusFilter = "" | "confirmed" | "found_unconfirmed" | "unlinked";

function asSellerOneRow(row: AllparfumeVariantItem): SellerOneSupplierProductItem {
    return row as unknown as SellerOneSupplierProductItem;
}

function catalogProductFromAllparfumeRow(row: AllparfumeVariantItem): ProductAdminItem | null {
    const source = row.product
        ? {
            id: row.product.id,
            name: row.product.name,
            slug: row.product.slug,
            brandName: row.brand?.name ?? null,
            variantsCount: 0,
        }
        : row.suggested_product
            ? {
                id: row.suggested_product.id,
                name: row.suggested_product.name,
                slug: row.suggested_product.slug ?? "",
                brandName: row.suggested_product.brand_name,
                variantsCount: row.suggested_product.variants_count,
            }
            : null;
    if (!source) {
        return null;
    }

    return {
        id: source.id,
        name: source.name,
        slug: source.slug,
        is_active: true,
        is_new: false,
        is_hit: false,
        variants_count: source.variantsCount,
        brand: source.brandName
            ? {
                id: row.brand?.id && row.brand.id > 0 ? row.brand.id : 0,
                name: source.brandName,
                slug: "",
            }
            : null,
    };
}

type ManualLinkSearchHostProps = {
    manualLink: ManualLinkState;
    setManualLink: Dispatch<SetStateAction<ManualLinkState | null>>;
    setError: Dispatch<SetStateAction<string>>;
    pickProduct: (product: ProductAdminItem) => Promise<void>;
    attachDefinitionFromDictionary: (definitionId: number) => Promise<void>;
    linkingRowId: number | null;
    onConfirmAction: (rowId: number, variantId: number) => Promise<void>;
    onPickVariantAction: (variantId: number) => void;
};

function ManualLinkSearchHost({
    manualLink,
    setManualLink,
    setError,
    pickProduct,
    attachDefinitionFromDictionary,
    linkingRowId,
    onConfirmAction,
    onPickVariantAction,
}: ManualLinkSearchHostProps) {
    const debouncedProductSearch = useDebouncedValue(manualLink.productSearch, SELLER_ONE_PRODUCT_SEARCH_DEBOUNCE_MS);
    const debouncedDefinitionSearch = useDebouncedValue(manualLink.definitionSearch, SELLER_ONE_DEFINITION_SEARCH_DEBOUNCE_MS);
    const isProductSearchDebouncing = manualLink.productSearch.trim() !== debouncedProductSearch.trim();
    const lastFetchedProductQueryRef = useRef<string | null>(null);
    const inFlightProductQueryRef = useRef<string | null>(null);

    useEffect(() => {
        lastFetchedProductQueryRef.current = null;
        inFlightProductQueryRef.current = null;
    }, [manualLink.rowId]);

    useEffect(() => {
        const rowId = manualLink.rowId;
        const linkSearchBrandId = manualLink.linkSearchBrandId;

        if (manualLink.selectedProductId !== null) {
            return;
        }

        const query = debouncedProductSearch.trim();
        if (query.length < 2) {
            lastFetchedProductQueryRef.current = null;
            inFlightProductQueryRef.current = null;
            setManualLink((prev) =>
                prev && prev.rowId === rowId ? { ...prev, products: [], productsLoading: false } : prev,
            );
            return;
        }

        if (query === lastFetchedProductQueryRef.current || query === inFlightProductQueryRef.current) {
            return;
        }

        let cancelled = false;
        inFlightProductQueryRef.current = query;

        const run = async () => {
            setManualLink((prev) =>
                prev && prev.rowId === rowId && prev.selectedProductId === null
                    ? { ...prev, productsLoading: true }
                    : prev,
            );
            try {
                const data = await fetchProductLinkSearch({
                    q: query,
                    brand_id: linkSearchBrandId && linkSearchBrandId > 0 ? linkSearchBrandId : undefined,
                    limit: 40,
                });
                if (cancelled) {
                    return;
                }
                lastFetchedProductQueryRef.current = query;
                inFlightProductQueryRef.current = null;
                setManualLink((prev) => {
                    if (!prev || prev.rowId !== rowId || prev.selectedProductId !== null) {
                        return prev;
                    }
                    return { ...prev, products: data.data || [], productsLoading: false };
                });
            } catch (e: unknown) {
                if (!cancelled) {
                    inFlightProductQueryRef.current = null;
                    setManualLink((prev) => (prev && prev.rowId === rowId ? { ...prev, productsLoading: false } : prev));
                    setError(e instanceof Error ? e.message : "Ошибка поиска товаров");
                }
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [debouncedProductSearch, manualLink.linkSearchBrandId, manualLink.rowId, manualLink.selectedProductId, setError, setManualLink]);

    useEffect(() => {
        const rowId = manualLink.rowId;
        const productId = manualLink.selectedProductId;
        if (productId === null) {
            return;
        }
        const query = debouncedDefinitionSearch.trim();
        let cancelled = false;

        const run = async () => {
            if (query === "") {
                setManualLink((prev) =>
                    prev && prev.rowId === rowId
                        ? { ...prev, definitions: [], definitionsLoading: false }
                        : prev,
                );
                return;
            }

            setManualLink((prev) => (prev && prev.rowId === rowId ? { ...prev, definitionsLoading: true } : prev));
            try {
                const data = await fetchVariantDefinitions({
                    search: query,
                    product_id: productId,
                });
                if (cancelled) {
                    return;
                }
                setManualLink((prev) =>
                    prev && prev.rowId === rowId
                        ? { ...prev, definitions: data.data || [], definitionsLoading: false }
                        : prev,
                );
            } catch (e: unknown) {
                if (!cancelled) {
                    setManualLink((prev) => (prev && prev.rowId === rowId ? { ...prev, definitionsLoading: false } : prev));
                    setError(e instanceof Error ? e.message : "Ошибка загрузки справочника");
                }
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [debouncedDefinitionSearch, manualLink.rowId, manualLink.selectedProductId, setError, setManualLink]);

    return (
        <ManualLinkModal
            manualLink={manualLink}
            isProductSearchDebouncing={isProductSearchDebouncing}
            linkingRowId={linkingRowId}
            setManualLink={setManualLink}
            onCloseAction={() => setManualLink(null)}
            onPickProductAction={pickProduct}
            onPickVariantAction={onPickVariantAction}
            onPickDefinitionAction={attachDefinitionFromDictionary}
            onConfirmAction={onConfirmAction}
        />
    );
}

export default function AllparfumeImportPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [brands, setBrands] = useState<AllparfumeBrandOption[]>([]);
    const [brandSlug, setBrandSlug] = useState(() => searchParams.get("brand") ?? "");
    const [items, setItems] = useState<AllparfumeVariantItem[]>([]);
    const [meta, setMeta] = useState<AllparfumeVariantsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchInput, setSearchInput] = useState(() => searchParams.get("search") ?? "");
    const [status, setStatus] = useState<StatusFilter>(() => {
        const raw = searchParams.get("status") ?? "";
        if (raw === "confirmed" || raw === "found_unconfirmed" || raw === "unlinked") {
            return raw;
        }
        return "";
    });
    const [page, setPage] = useUrlPage();
    const [perPage, setPerPageState] = useState<PerPageOption>(() => {
        const fromUrl = searchParams.get("per_page");
        if (fromUrl) {
            return parsePerPage(fromUrl);
        }
        return readStoredPerPage();
    });
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [autoMatchLoading, setAutoMatchLoading] = useState(false);
    const [importIdsLoading, setImportIdsLoading] = useState(false);
    const importIdsFileRef = useRef<HTMLInputElement>(null);
    const [syncJob, setSyncJob] = useState<AllparfumeSyncJobStatus | null>(null);
    const [syncRunning, setSyncRunning] = useState(false);
    const [manualLink, setManualLink] = useState<ManualLinkState | null>(null);
    const [linkingRowId, setLinkingRowId] = useState<number | null>(null);
    const [offersTooltip, setOffersTooltip] = useState<{
        left: number;
        top: number;
        placement: "above" | "below";
        offers: AllparfumeVariantItem["shop_offers"];
    } | null>(null);
    const offersTooltipCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const debouncedSearch = useDebouncedValue(searchInput, 350);

    const setPerPage = useCallback((next: PerPageOption) => {
        setPerPageState(next);
        try {
            window.localStorage.setItem(PER_PAGE_STORAGE_KEY, String(next));
        } catch {
            // ignore quota / private mode
        }
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString());

        if (brandSlug) {
            params.set("brand", brandSlug);
        } else {
            params.delete("brand");
        }

        if (status) {
            params.set("status", status);
        } else {
            params.delete("status");
        }

        if (debouncedSearch.trim()) {
            params.set("search", debouncedSearch.trim());
        } else {
            params.delete("search");
        }

        if (perPage === 50) {
            params.delete("per_page");
        } else {
            params.set("per_page", String(perPage));
        }

        const qs = params.toString();
        if (qs !== searchParams.toString()) {
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }
    }, [brandSlug, status, debouncedSearch, perPage, pathname, router, searchParams]);

    const clearOffersTooltipCloseTimer = () => {
        if (offersTooltipCloseTimerRef.current) {
            clearTimeout(offersTooltipCloseTimerRef.current);
            offersTooltipCloseTimerRef.current = null;
        }
    };

    const openOffersTooltip = (
        rect: DOMRect,
        offers: AllparfumeVariantItem["shop_offers"],
    ) => {
        clearOffersTooltipCloseTimer();
        const estimatedHeight = Math.min(16 + offers.length * 22, 240);
        const spaceBelow = window.innerHeight - rect.bottom;
        const placeAbove = spaceBelow < estimatedHeight + 12 && rect.top > estimatedHeight + 12;
        setOffersTooltip({
            left: rect.left,
            top: placeAbove ? rect.top + 4 : rect.top - 4,
            placement: placeAbove ? "above" : "below",
            offers,
        });
    };

    const scheduleCloseOffersTooltip = () => {
        clearOffersTooltipCloseTimer();
        offersTooltipCloseTimerRef.current = setTimeout(() => {
            setOffersTooltip(null);
            offersTooltipCloseTimerRef.current = null;
        }, 300);
    };

    useEffect(() => {
        return () => clearOffersTooltipCloseTimer();
    }, []);

    useEffect(() => {
        void (async () => {
            try {
                const data = await fetchAllparfumeBrands();
                setBrands(data.data || []);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Ошибка загрузки брендов");
            }
        })();
    }, []);

    useEffect(() => {
        void (async () => {
            try {
                const res = await fetchAllparfumeSyncActive();
                const active = res.data;
                if (active?.job_id && (active.status === "queued" || active.status === "running")) {
                    setSyncJob(active);
                    setSyncRunning(true);
                }
            } catch {
                // ignore
            }
        })();
    }, []);

    const loadRows = useCallback(async (targetPage = page) => {
        setLoading(true);
        setError("");
        try {
            const data = await fetchAllparfumeVariants({
                brand_slug: brandSlug || undefined,
                search: debouncedSearch || undefined,
                status: status || undefined,
                page: targetPage,
                per_page: perPage,
            });
            setItems(data.data || []);
            setMeta(data);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки таблицы");
        } finally {
            setLoading(false);
        }
    }, [brandSlug, debouncedSearch, page, perPage, status]);

    useResetPageOnChange(setPage, [debouncedSearch, status, brandSlug, perPage]);

    useEffect(() => {
        void loadRows(page);
    }, [loadRows, page]);

    useEffect(() => {
        if (!syncRunning || !syncJob?.job_id) {
            return;
        }
        const timer = setInterval(() => {
            void (async () => {
                try {
                    const res = await fetchAllparfumeSyncStatus(syncJob.job_id);
                    if (!res.data) {
                        return;
                    }
                    setSyncJob(res.data);
                    if (res.data.status === "completed" || res.data.status === "failed") {
                        setSyncRunning(false);
                        if (res.data.status === "completed") {
                            const statsMsg =
                                typeof res.data.message === "string" && res.data.message.trim() !== ""
                                    ? res.data.message
                                    : res.data.job_type === "full"
                                      ? "Парсинг Allparfume завершён"
                                      : "Обновление цен Allparfume завершено";
                            setSuccess(statsMsg);
                            void loadRows(page);
                            void fetchAllparfumeBrands()
                                .then((data) => setBrands(data.data || []))
                                .catch(() => undefined);
                        } else {
                            setError(res.data.message || "Ошибка синхронизации Allparfume");
                        }
                    }
                } catch {
                    // ignore polling errors
                }
            })();
        }, 2000);
        return () => clearInterval(timer);
    }, [syncRunning, syncJob?.job_id, loadRows, page]);

    const doForceLink = async (allparfumeVariantId: number, variantId: number) => {
        setLinkingRowId(allparfumeVariantId);
        setError("");
        try {
            await forceLinkAllparfumeVariant({
                allparfume_variant_id: allparfumeVariantId,
                variant_id: variantId,
            });
            await loadRows(page);
            setSuccess(`Связка сохранена для #${allparfumeVariantId}`);
            if (manualLink?.rowId === allparfumeVariantId) {
                setManualLink(null);
            }
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка связывания");
        } finally {
            setLinkingRowId(null);
        }
    };

    const handleResetLink = async (allparfumeVariantId: number) => {
        setLinkingRowId(allparfumeVariantId);
        setError("");
        try {
            await resetAllparfumeVariantLink({ allparfume_variant_id: allparfumeVariantId });
            await loadRows(page);
            setSuccess(`Связка сброшена для #${allparfumeVariantId}`);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка сброса связки");
        } finally {
            setLinkingRowId(null);
        }
    };

    const handleToggleLink = async (row: AllparfumeVariantItem, checked: boolean) => {
        if (checked) {
            if (!canConfirmSuggestedLink(row)) {
                setError(
                    row.suggested_variant
                        ? "Автосвязка только при 100% и точном имени. Свяжите вручную."
                        : "Нет автокандидата",
                );
                return;
            }
            await doForceLink(row.id, row.suggested_variant!.id);
            return;
        }
        if (!row.is_linked) {
            return;
        }
        await handleResetLink(row.id);
    };

    const handleAutoMatch = async () => {
        const scopeNote = brandSlug
            ? `\n\nСейчас выбран бренд «${brandSlug}» — автоматчинг только по нему.`
            : "\n\nПо всем брендам в базе.";
        if (!confirmAllparfumeAction(ALLPARFUME_CONFIRM.autoMatch + scopeNote)) {
            return;
        }
        setAutoMatchLoading(true);
        setError("");
        setSuccess("");
        try {
            const result = await runAllparfumeAutoMatch({
                brand_slug: brandSlug || undefined,
                only_unlinked: true,
            });
            setSuccess(result.message || "Автоматчинг завершён");
            await loadRows(page);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка автоматчинга");
        } finally {
            setAutoMatchLoading(false);
        }
    };

    const handleImportIdsFile = async (file: File) => {
        setImportIdsLoading(true);
        setError("");
        setSuccess("");
        try {
            const parsed = JSON.parse(await file.text()) as unknown;
            const rawItems = Array.isArray(parsed)
                ? parsed
                : parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown }).items)
                    ? (parsed as { items: unknown[] }).items
                    : null;
            if (!rawItems || rawItems.length === 0) {
                setError("В файле нет items");
                return;
            }
            const payloadItems = rawItems.flatMap((row) => {
                if (!row || typeof row !== "object") {
                    return [];
                }
                const rec = row as {
                    perfumer_url?: unknown;
                    allparfume_url?: unknown;
                    allparfume_id?: unknown;
                };
                const id = Number(rec.allparfume_id);
                const perfumerUrl = normalizeImportedPerfumerUrl(rec.perfumer_url);
                if (!Number.isInteger(id) || id < 1 || perfumerUrl == null) {
                    return [];
                }
                return [{
                    perfumer_url: perfumerUrl,
                    allparfume_url: String(rec.allparfume_url ?? ""),
                    allparfume_id: id,
                }];
            });
            if (payloadItems.length === 0) {
                setError("В файле нет корректных строк");
                return;
            }
            const result = await importAllparfumeIds({ items: payloadItems });
            setSuccess(result.message || "Импорт ID завершён");
            await loadRows(page);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Не удалось загрузить JSON с ID");
        } finally {
            setImportIdsLoading(false);
            if (importIdsFileRef.current) {
                importIdsFileRef.current.value = "";
            }
        }
    };

    const handleRefreshPrices = async () => {
        if (!confirmAllparfumeAction(ALLPARFUME_CONFIRM.refreshPrices)) {
            return;
        }
        setError("");
        setSuccess("");
        setSyncRunning(true);
        try {
            const result = await startAllparfumeRefreshPrices();
            setSyncJob({
                job_id: result.job_id,
                job_type: "refresh",
                status: "queued",
                message: result.message || "Обновление цен поставлено в очередь",
                progress: 0,
            });
            setSuccess(result.message || "Обновление цен поставлено в очередь");
        } catch (e: unknown) {
            setSyncRunning(false);
            setError(e instanceof Error ? e.message : "Не удалось запустить обновление цен");
        }
    };

    const handleFullSync = async () => {
        if (!confirmAllparfumeAction(ALLPARFUME_CONFIRM.syncAll)) {
            return;
        }
        setError("");
        setSuccess("");
        setSyncRunning(true);
        try {
            const result = await startAllparfumeFullSync();
            setSyncJob({
                job_id: result.job_id,
                job_type: "full",
                status: "queued",
                message: result.message || "Парсинг поставлен в очередь",
                progress: 0,
            });
            setSuccess(result.message || "Парсинг поставлен в очередь");
        } catch (e: unknown) {
            setSyncRunning(false);
            setError(e instanceof Error ? e.message : "Не удалось запустить парсинг");
        }
    };

    const openManualLink = (row: AllparfumeVariantItem) => {
        const sellerRow = asSellerOneRow(row);
        const initialSearch = buildInitialSearchFromRow(sellerRow);
        const sourceHint = {
            brand: row.source_brand_name || row.parsed?.brand || "",
            productName: row.source_product_name || row.parsed?.product_name || row.external_name || "",
            volume: row.parsed?.volume ?? null,
            concentration: row.parsed?.concentration ?? null,
            isTester: Boolean(row.parsed?.is_tester),
            isVial: Boolean(row.parsed?.is_vial),
            isMiniature: Boolean(row.parsed?.is_miniature),
        };
        const pinnedProduct = catalogProductFromAllparfumeRow(row);
        setManualLink({
            rowId: row.id,
            rowName: row.external_name,
            linkSearchBrandId: row.brand?.id && row.brand.id > 0 ? row.brand.id : null,
            productSearch: pinnedProduct ? formatCatalogProductLabel(pinnedProduct) : initialSearch,
            sourceHint,
            products: pinnedProduct ? [pinnedProduct] : [],
            productsLoading: false,
            selectedProductId: pinnedProduct?.id ?? null,
            variants: [],
            variantsLoading: Boolean(pinnedProduct),
            selectedVariantId: null,
            definitionSearch: buildDefinitionSearchFromHint(sourceHint),
            definitions: [],
            definitionsLoading: false,
            attachingDefinition: false,
        });
        if (pinnedProduct) {
            void loadManualVariants(
                pinnedProduct.id,
                row.suggested_variant?.id ?? row.linked_variant?.id,
                pinnedProduct,
            );
        }
    };

    const loadManualVariants = async (
        productId: number,
        preferVariantId?: number,
        pickedProduct?: ProductAdminItem,
    ) => {
        setManualLink((prev) => {
            if (!prev) {
                return prev;
            }
            const productSearch = pickedProduct ? formatCatalogProductLabel(pickedProduct) : prev.productSearch;
            const products =
                pickedProduct && !prev.products.some((p) => p.id === pickedProduct.id)
                    ? [pickedProduct, ...prev.products]
                    : prev.products;
            return {
                ...prev,
                productSearch,
                products,
                selectedProductId: productId,
                variants: [],
                selectedVariantId: null,
                variantsLoading: true,
                definitions: [],
                definitionSearch: buildDefinitionSearchFromHint(prev.sourceHint),
                definitionsLoading: false,
            };
        });
        try {
            const data = await fetchProductVariants(productId);
            const variants = data.data || [];
            setManualLink((prev) => {
                if (!prev) {
                    return prev;
                }
                const fullMatchVariant = variants.find((variant) =>
                    isFullVariantMatch(getVariantMatchFlags(variant, prev.sourceHint)),
                );
                const preferred =
                    preferVariantId
                        && variants.some((v) => v.id === preferVariantId && variantMatchesVolumeHint(v, prev.sourceHint))
                        ? preferVariantId
                        : fullMatchVariant?.id ?? null;
                return {
                    ...prev,
                    variants,
                    variantsLoading: false,
                    selectedVariantId: preferred,
                };
            });
        } catch (e: unknown) {
            setManualLink((prev) => (prev ? { ...prev, variantsLoading: false } : prev));
            setError(e instanceof Error ? e.message : "Ошибка загрузки вариантов");
        }
    };

    const pickProduct = async (product: ProductAdminItem) => {
        await loadManualVariants(product.id, undefined, product);
    };

    const attachDefinitionFromDictionary = async (definitionId: number) => {
        if (!manualLink?.selectedProductId) {
            return;
        }
        const productId = manualLink.selectedProductId;
        const existing = manualLink.variants.find((v) => v.variant_definition_id === definitionId);
        setManualLink((prev) => (prev ? { ...prev, attachingDefinition: true } : prev));
        setError("");
        try {
            if (existing) {
                await loadManualVariants(productId, existing.id);
                return;
            }
            const created = await createProductVariant(productId, {
                variant_definition_id: definitionId,
                stock: 0,
                is_active: true,
                is_preorder: false,
                sort_order: 0,
            });
            await loadManualVariants(productId, created.data.id);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Не удалось создать вариант");
        } finally {
            setManualLink((prev) => (prev ? { ...prev, attachingDefinition: false } : prev));
        }
    };

    const brandOptions = brands.map((b) => ({
        value: b.brand_slug,
        label: `${b.brand_name || b.brand_slug} (${b.products_count})`,
    }));

    const hasActiveFilters = searchInput.trim() !== "" || status !== "" || brandSlug !== "";
    const syncProgress = Math.max(0, Math.min(100, Math.round(Number(syncJob?.progress ?? 0))));
    const syncProcessed = Number(syncJob?.processed ?? 0);
    const syncTotal = Number(syncJob?.total ?? 0);
    const showSyncProgress =
        syncRunning || syncJob?.status === "queued" || syncJob?.status === "running";
    const syncTitle =
        syncJob?.job_type === "full" ? "Парсинг Allparfume" : "Обновление цен Allparfume";
    const pricesUpdatedLabel = formatAllparfumeUpdatedAt(meta?.stats?.last_crawled_at);

    return (
        <AdminPageCard>
            <div className="space-y-4 rounded-2xl border bg-white p-6">
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                            <p className="text-sm text-admin-text-secondary">
                                Сопоставление вариантов allparfume.by с каталогом
                            </p>
                            {pricesUpdatedLabel ? (
                                <p className="mt-0.5 text-[11px] font-medium tabular-nums text-emerald-700">
                                    Обновлено - {pricesUpdatedLabel}
                                </p>
                            ) : null}
                        </div>
                        <div className="flex flex-wrap items-start gap-2">
                        <button
                            type="button"
                            onClick={() => void handleRefreshPrices()}
                            disabled={syncRunning || autoMatchLoading || importIdsLoading || loading}
                            className={`${adminBtnSecondary} disabled:opacity-50`}
                            title="Обновить цены/офферы только у уже сохранённых после парсинга товаров"
                        >
                            {syncRunning && syncJob?.job_type === "refresh" ? "Обновление…" : "Обновить цены"}
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleFullSync()}
                            disabled={syncRunning || autoMatchLoading || importIdsLoading || loading}
                            className={`${adminBtnSecondary} disabled:opacity-50`}
                            title="Парсинг всех брендов: создать новые товары, варианты и офферы"
                        >
                            {syncRunning && syncJob?.job_type === "full" ? "Парсинг…" : "Парсинг"}
                        </button>
                        <button
                            type="button"
                            onClick={() => importIdsFileRef.current?.click()}
                            disabled={importIdsLoading || syncRunning || autoMatchLoading || loading}
                            className={`${adminBtnSecondary} disabled:opacity-50`}
                            title="Загрузить JSON с allparfume_id, нашим и их URL"
                        >
                            {importIdsLoading ? "Загрузка ID…" : "Загрузить ID"}
                        </button>
                        <input
                            ref={importIdsFileRef}
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    void handleImportIdsFile(file);
                                }
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => void handleAutoMatch()}
                            disabled={autoMatchLoading || importIdsLoading || syncRunning || loading}
                            className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm text-blue-900 hover:bg-blue-100 disabled:opacity-50"
                        >
                            {autoMatchLoading ? "Автоматчинг…" : "Автоматчинг"}
                        </button>
                    </div>
                    </div>
                    <AllparfumeAdminNav />
                </div>

                {error ? <AlertMessage message={error} onCloseAction={() => setError("")} /> : null}
                {success ? <SuccessMessage message={success} onCloseAction={() => setSuccess("")} /> : null}

                {showSyncProgress ? (
                    <div className="space-y-1 rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-3 py-2">
                        <div className="flex items-center justify-between gap-2 text-xs text-emerald-800">
                            <span className="font-medium">{syncTitle}</span>
                            {syncTotal > 0 ? (
                                <span className="shrink-0 tabular-nums text-emerald-700/90">
                                    {syncProcessed} / {syncTotal}
                                </span>
                            ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-emerald-100">
                                <span
                                    className="block h-full rounded-full bg-emerald-500 transition-all"
                                    style={{ width: `${Math.max(2, syncProgress)}%` }}
                                />
                            </span>
                            <span className="shrink-0 text-[11px] font-medium tabular-nums text-emerald-700">
                                {syncProgress}%
                            </span>
                        </div>
                        {syncJob?.message ? (
                            <p className="text-[11px] text-emerald-700/90">{syncJob.message}</p>
                        ) : null}
                    </div>
                ) : null}

                <div className="flex flex-col gap-2 rounded-lg border bg-admin-muted px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
                    <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-admin-text-secondary">
                        <span className="font-medium text-admin-text">Всего: {meta?.total ?? 0}</span>
                        <span>Связанные: {meta?.stats?.confirmed ?? 0}</span>
                        <span>Есть кандидат: {meta?.stats?.found_unconfirmed ?? 0}</span>
                        <span>Не связанные: {meta?.stats?.unlinked ?? 0}</span>
                    </div>
                    <div className="flex min-w-0 w-full items-center justify-end gap-1.5 lg:w-auto lg:flex-1">
                    <AdminSearchableSelect
                        className="min-w-0 shrink-0 [&_button]:!w-[9.25rem] [&_button]:md:!w-[9.25rem]"
                        value={brandSlug}
                        onChangeAction={setBrandSlug}
                        options={brandOptions}
                        placeholder="Бренд"
                        emptyLabel="Все бренды"
                        title="Выбор бренда"
                        subtitle="Найдите бренд allparfume"
                        searchPlaceholder="Поиск бренда..."
                    />
                    <AdminStatusDropdown
                        value={status}
                        onChangeAction={(value) => setStatus(value as StatusFilter)}
                        options={[
                            { value: "", label: "Статусы" },
                            ...STATUS_OPTIONS,
                        ]}
                        widthClassName="w-max shrink-0"
                        menuWidthClassName="w-max"
                    />
                    <AdminSearchInput
                        className="min-w-0 w-full lg:w-[35%] lg:min-w-[16rem] lg:shrink-0"
                        widthClassName="w-full"
                        value={searchInput}
                        onChangeAction={setSearchInput}
                        placeholder="Поиск: бренд, название, объём"
                        syncWithUrl={false}
                    />
                    {hasActiveFilters ? (
                        <button
                            type="button"
                            onClick={() => {
                                setSearchInput("");
                                setStatus("");
                                setBrandSlug("");
                                setPage(1);
                            }}
                            className="inline-flex h-9 shrink-0 items-center rounded-lg border border-admin-border bg-admin-surface px-2.5 text-[11px] whitespace-nowrap text-admin-text-secondary transition hover:bg-white"
                        >
                            Сбросить
                        </button>
                    ) : null}
                    </div>
                </div>

                {loading ? (
                    <div className="rounded-xl border px-4 py-5 text-sm text-admin-text-secondary">
                        Загрузка таблицы...
                    </div>
                ) : null}

                {!loading && items.length > 0 ? (
                    <div className="space-y-4">
                        <div className="min-w-0 overflow-x-auto rounded-xl border">
                            <table className="w-full min-w-[1080px] table-fixed text-sm">
                                <colgroup>
                                    <col style={{ width: "44px" }} />
                                    <col style={{ width: "30%" }} />
                                    <col style={{ width: "88px" }} />
                                    <col style={{ width: "72px" }} />
                                    <col style={{ width: "72px" }} />
                                    <col style={{ width: "72px" }} />
                                    <col style={{ width: "30%" }} />
                                </colgroup>
                                <thead className="bg-admin-muted">
                                    <tr className="text-left text-xs">
                                        <th className="px-1.5 py-2 text-center font-medium" title="Связь">
                                            <span className="sr-only">Связь</span>
                                            ✓
                                        </th>
                                        <th className="px-3 py-2 font-medium">Товар allparfume</th>
                                        <th className="px-2 py-2 font-medium">Статус</th>
                                        <th className="px-2 py-2 text-right font-medium">Мин. цена</th>
                                        <th className="px-2 py-2 text-right font-medium">Офферы</th>
                                        <th className="px-2 py-2 text-right font-medium">Цена сайта</th>
                                        <th className="px-3 py-2 font-medium">Каталог</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((row) => {
                                        const sellerRow = asSellerOneRow(row);
                                        const catalogProductLabel = getRowCatalogProductLabel(sellerRow);
                                        const nameMatchInfo = catalogProductLabel
                                            ? findSellerOneRowNameMatchInfo(sellerRow, catalogProductLabel)
                                            : {
                                                words: [],
                                                catalogWords: [],
                                                exact: false,
                                                brandPrefix: null,
                                                catalogBrandPrefix: null,
                                            };

                                        return (
                                            <tr key={row.id} className="border-t align-top">
                                                <td className="px-1.5 py-3 text-center align-middle">
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(row.is_linked)}
                                                        disabled={linkingRowId === row.id || !canConfirmSuggestedLink(row)}
                                                        title={
                                                            !canConfirmSuggestedLink(row) && !row.is_linked
                                                                ? "Галочка только при 100% и точном имени"
                                                                : undefined
                                                        }
                                                        onChange={(e) => void handleToggleLink(row, e.target.checked)}
                                                        className={adminCheckbox}
                                                    />
                                                </td>
                                                <td className="px-3 py-3">
                                                    <div className="space-y-0.5">
                                                        {(() => {
                                                            const brand = (row.source_brand_name || "").trim();
                                                            const name = (row.source_product_name || "").trim();
                                                            let label = row.external_name;
                                                            if (brand && name) {
                                                                const nameLower = name.toLowerCase();
                                                                const brandLower = brand.toLowerCase();
                                                                label =
                                                                    nameLower === brandLower || nameLower.startsWith(`${brandLower} `)
                                                                        ? name
                                                                        : `${brand} ${name}`;
                                                            } else {
                                                                label = name || brand || row.external_name;
                                                            }

                                                            const searchQ = debouncedSearch.trim();
                                                            const titleNode = searchQ ? (
                                                                <span className="break-words font-medium">
                                                                    {highlightAdminSearchTerms(label, searchQ, brand || null)}
                                                                </span>
                                                            ) : (
                                                                <HighlightedNameText
                                                                    text={label}
                                                                    matchInfo={nameMatchInfo}
                                                                    className="break-words font-medium"
                                                                />
                                                            );

                                                            return row.external_url ? (
                                                                <a
                                                                    href={row.external_url}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="inline-block hover:underline"
                                                                >
                                                                    {titleNode}
                                                                </a>
                                                            ) : (
                                                                titleNode
                                                            );
                                                        })()}
                                                        {row.raw_label ? (
                                                            <div className="text-xs text-admin-text-secondary">
                                                                {debouncedSearch.trim()
                                                                    ? highlightAdminSearchTerms(row.raw_label, debouncedSearch)
                                                                    : row.raw_label}
                                                            </div>
                                                        ) : null}
                                                        {row.external_id ? (
                                                            <div className="text-[11px] tabular-nums text-admin-text-secondary">
                                                                ID {row.external_id}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td className="whitespace-nowrap px-2 py-3">
                                                    {row.status === "confirmed" ? (
                                                        <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
                                                            Связан
                                                        </span>
                                                    ) : row.status === "found_unconfirmed"
                                                        && row.suggested_product
                                                        && !row.suggested_variant ? (
                                                        <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">
                                                            Продукт совпал
                                                        </span>
                                                    ) : row.status === "found_unconfirmed" ? (
                                                        <ConfidenceBadge label="Кандидат" confidence={row.match_confidence} />
                                                    ) : (
                                                        <ConfidenceBadge label="Не связан" confidence={row.match_confidence} />
                                                    )}
                                                </td>
                                                <td className="px-2 py-3 text-right tabular-nums text-xs">
                                                    {row.min_price ?? "—"}
                                                </td>
                                                <td className="px-2 py-3 text-right text-xs">
                                                    {(row.shop_offers?.length ?? 0) > 0 ? (
                                                        <span
                                                            className="cursor-pointer tabular-nums underline decoration-dotted underline-offset-2"
                                                            onMouseEnter={(e) => {
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                openOffersTooltip(rect, row.shop_offers);
                                                            }}
                                                            onMouseLeave={scheduleCloseOffersTooltip}
                                                        >
                                                            {row.offers_count}
                                                        </span>
                                                    ) : (
                                                        <span className="tabular-nums text-admin-text-secondary">0</span>
                                                    )}
                                                </td>
                                                <td className="px-2 py-3 text-right tabular-nums text-xs">
                                                    {row.is_linked && row.site_price != null && row.site_price !== ""
                                                        ? row.site_price
                                                        : "—"}
                                                </td>
                                                <td
                                                    className="cursor-pointer px-3 py-3 text-xs whitespace-normal break-words"
                                                    onClick={() => openManualLink(row)}
                                                >
                                                    {row.is_linked && row.linked_variant ? (
                                                        <div>
                                                            <HighlightedNameText
                                                                text={
                                                                    row.linked_variant.display_name
                                                                    || row.linked_variant.product_name
                                                                    || ""
                                                                }
                                                                matchInfo={nameMatchInfo}
                                                                highlightSource="catalog"
                                                                className="break-words font-medium"
                                                            />
                                                            <div className="break-words text-admin-text-secondary">
                                                                {row.linked_variant.display || "Вариант"}
                                                            </div>
                                                        </div>
                                                    ) : row.suggested_variant ? (
                                                        <div>
                                                            <HighlightedNameText
                                                                text={
                                                                    row.suggested_variant.display_name
                                                                    || row.suggested_variant.product_name
                                                                    || ""
                                                                }
                                                                matchInfo={nameMatchInfo}
                                                                highlightSource="catalog"
                                                                className="break-words font-medium"
                                                            />
                                                            <div className="break-words text-admin-text-secondary">
                                                                {row.suggested_variant.display || "Вариант"}
                                                            </div>
                                                        </div>
                                                    ) : row.suggested_product ? (
                                                        <div>
                                                            <HighlightedNameText
                                                                text={
                                                                    row.suggested_product.display_name
                                                                    || row.suggested_product.name
                                                                }
                                                                matchInfo={nameMatchInfo}
                                                                highlightSource="catalog"
                                                                className="break-words font-medium"
                                                            />
                                                            <div
                                                                className={`break-words ${isSimilarProductMatch(row.match_confidence_breakdown) ? "text-amber-700" : "text-admin-text-secondary"}`}
                                                            >
                                                                {getSuggestedProductOnlyMessage(
                                                                    row.match_confidence_breakdown,
                                                                    row.suggested_product.variants_count,
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-admin-text-secondary">Нажмите для ручной связки</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
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
                    <div className="rounded-xl border px-4 py-5 text-sm text-admin-text-secondary">
                        Нет вариантов. Запустите «Парсинг» или:
                        {" "}
                        <code className="text-xs">php artisan allparfume:sync-brand --all</code>
                    </div>
                ) : null}

                {manualLink ? (
                    <ManualLinkSearchHost
                        manualLink={manualLink}
                        setManualLink={setManualLink}
                        setError={setError}
                        pickProduct={pickProduct}
                        attachDefinitionFromDictionary={attachDefinitionFromDictionary}
                        linkingRowId={linkingRowId}
                        onConfirmAction={doForceLink}
                        onPickVariantAction={(variantId) => {
                            setManualLink((prev) => (prev ? { ...prev, selectedVariantId: variantId } : prev));
                        }}
                    />
                ) : null}

                {offersTooltip ? (
                    <div
                        className={`fixed z-[300] flex -translate-x-full ${offersTooltip.placement === "above" ? "-translate-y-full" : ""}`}
                        style={{ left: offersTooltip.left, top: offersTooltip.top }}
                        onMouseEnter={clearOffersTooltipCloseTimer}
                        onMouseLeave={scheduleCloseOffersTooltip}
                    >
                        <div className="w-60 rounded-lg border bg-white p-2 text-left shadow-lg">
                            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-admin-text-secondary">
                                Офферы магазинов
                            </div>
                            <ul className="max-h-56 space-y-1 overflow-y-auto overscroll-contain">
                                {offersTooltip.offers.map((offer) => (
                                    <li
                                        key={`${offer.shop_key}-${offer.price}`}
                                        className="flex items-start justify-between gap-2 text-[11px]"
                                    >
                                        <span className="min-w-0 break-words text-admin-text">{offer.shop_name}</span>
                                        <span className="shrink-0 tabular-nums font-medium">{offer.price}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div
                            className={`w-3 shrink-0 ${offersTooltip.placement === "above" ? "self-end h-6" : ""}`}
                            aria-hidden
                        />
                    </div>
                ) : null}
            </div>
        </AdminPageCard>
    );
}

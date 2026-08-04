"use client";

import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import { PackagePlus } from "lucide-react";
import CopyText from "@/components/ui/copy-text";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import { highlightAdminSearchTerms } from "@/lib/admin-search-highlight";
import {
    createSellerOneRule,
    deleteSellerOneRule,
    cancelSellerOneParseJob,
    fetchSellerOneDuplicateVariantLinks,
    fetchSellerOneParseStatus,
    fetchSellerOneActiveStatus,
    fetchSellerOneSupplierProducts,
    fetchSellerOneRules,
    forceLinkSellerOneProduct,
    resetSellerOneProductLink,
    startSellerOneParseJob,
    updateSellerOneSupplierProductParsingActive,
    updateSellerOneRule,
} from "@/lib/admin-vanille-api";
import AddToReceiptModal from "@/components/admin/import-export/seller-one/add-to-receipt-modal";
import ParseFileModal from "@/components/admin/import-export/seller-one/parse-file-modal";
import type {
    SellerOneDuplicateVariantLinksResponse,
    SellerOneMatchRule,
    SellerOneParseDiagnostics,
    SellerOneSupplierProductItem,
    SellerOneSupplierProductsResponse,
} from "@/types/Vanille";
import { fetchProductLinkSearch, type ProductAdminItem } from "@/lib/admin-products-api";
import {
    createProductVariant,
    fetchProductVariants,
    fetchVariantDefinitions,
} from "@/lib/admin-product-variants-api";
import {
    STATUS_OPTIONS,
    STOCK_FILTER_OPTIONS,
    PRICE_PARSE_SUPPLIERS,
    type PriceParseSupplierCode,
    type SellerOneStatusFilter,
    type SellerOneStockFilter,
    SELLER_ONE_DEFINITION_SEARCH_DEBOUNCE_MS,
    SELLER_ONE_PRODUCT_SEARCH_DEBOUNCE_MS,
} from "@/components/admin/import-export/seller-one/constants";
import {
    buildDefinitionSearchFromHint,
    buildInitialSearchFromRow,
    findSellerOneRowNameMatchInfo,
    formatCatalogProductLabel,
    canConfirmSuggestedLink,
    getRowCatalogProductLabel,
    getSuggestedProductOnlyMessage,
    isSimilarProductMatch,
    getVariantMatchFlags,
    isFullVariantMatch,
    isTransientNetworkError,
    variantMatchesVolumeHint,
} from "@/components/admin/import-export/seller-one/utils";
import { type ManualLinkState } from "@/components/admin/import-export/seller-one/types";
import {
    AlertMessage,
    ConfidenceBadge,
    HighlightedNameText,
    DuplicateVariantLinksModal,
    ParseDiagnosticsPanel,
    ManualLinkModal,
    RulesModal,
    SuccessMessage,
} from "@/components/admin/import-export/seller-one/ui";

type ManualLinkSearchHostProps = {
    manualLink: ManualLinkState;
    setManualLink: Dispatch<SetStateAction<ManualLinkState | null>>;
    setSupplierError: Dispatch<SetStateAction<string>>;
    pickProduct: (product: ProductAdminItem) => Promise<void>;
    attachDefinitionFromDictionary: (definitionId: number) => Promise<void>;
    linkingRowId: number | null;
    onConfirmAction: (rowId: number, variantId: number) => Promise<void>;
    onPickVariantAction: (variantId: number) => void;
};

function ManualLinkSearchHost({
    manualLink,
    setManualLink,
    setSupplierError,
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
                prev && prev.rowId === rowId
                    ? { ...prev, products: [], productsLoading: false }
                    : prev,
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
                    brand_id: linkSearchBrandId ?? undefined,
                    limit: 40,
                });
                const nextProducts = data.data || [];

                if (cancelled) {
                    return;
                }

                lastFetchedProductQueryRef.current = query;
                inFlightProductQueryRef.current = null;

                setManualLink((prev) => {
                    if (!prev || prev.rowId !== rowId || prev.selectedProductId !== null) {
                        return prev;
                    }

                    return {
                        ...prev,
                        products: nextProducts,
                        productsLoading: false,
                    };
                });
            } catch (e: unknown) {
                if (!cancelled) {
                    inFlightProductQueryRef.current = null;
                    setManualLink((prev) => (prev && prev.rowId === rowId ? { ...prev, productsLoading: false } : prev));
                    setSupplierError(e instanceof Error ? e.message : "Ошибка поиска товаров");
                }
            }
        };

        void run();
        return () => {
            cancelled = true;
            if (inFlightProductQueryRef.current === query) {
                inFlightProductQueryRef.current = null;
            }
        };
    }, [
        manualLink.rowId,
        manualLink.linkSearchBrandId,
        manualLink.selectedProductId,
        debouncedProductSearch,
        setManualLink,
        setSupplierError,
    ]);

    useEffect(() => {
        const rowId = manualLink.rowId;
        const productId = manualLink.selectedProductId;
        if (!productId) {
            return;
        }

        let cancelled = false;
        const q = debouncedDefinitionSearch.trim();

        const run = async () => {
            if (q === "") {
                setManualLink((prev) =>
                    prev && prev.rowId === rowId
                        ? { ...prev, definitions: [], definitionsLoading: false }
                        : prev
                );
                return;
            }

            setManualLink((prev) => (prev && prev.rowId === rowId ? { ...prev, definitionsLoading: true } : prev));
            try {
                const res = await fetchVariantDefinitions({ search: q, product_id: productId });
                if (cancelled) {
                    return;
                }
                setManualLink((prev) =>
                    prev && prev.rowId === rowId
                        ? {
                            ...prev,
                            definitions: res.data || [],
                            definitionsLoading: false,
                        }
                        : prev
                );
            } catch (e: unknown) {
                if (!cancelled) {
                    setManualLink((prev) => (prev && prev.rowId === rowId ? { ...prev, definitionsLoading: false } : prev));
                    setSupplierError(e instanceof Error ? e.message : "Ошибка поиска в справочнике");
                }
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [manualLink.rowId, manualLink.selectedProductId, debouncedDefinitionSearch, setManualLink, setSupplierError]);

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

const SELLER_ONE_ACTIVE_JOB_STORAGE_KEY = "seller-pars-active-job-id";

export default function SellerParsImportPage() {
    const [supplierFile, setSupplierFile] = useState<File | null>(null);
    const [selectedSupplierCode, setSelectedSupplierCode] = useState<PriceParseSupplierCode | null>(null);
    const [parseFileModalOpen, setParseFileModalOpen] = useState(false);
    const [supplierPreviewLoading, setSupplierPreviewLoading] = useState(false);
    const [cancelParseLoading, setCancelParseLoading] = useState(false);
    const [batchProgress, setBatchProgress] = useState("");
    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const [supplierError, setSupplierError] = useState("");
    const [supplierSuccess, setSupplierSuccess] = useState("");
    const [parseDiagnostics, setParseDiagnostics] = useState<SellerOneParseDiagnostics | null>(null);
    const [duplicateLinksOpen, setDuplicateLinksOpen] = useState(false);
    const [duplicateLinksLoading, setDuplicateLinksLoading] = useState(false);
    const [duplicateLinksError, setDuplicateLinksError] = useState("");
    const [duplicateLinksData, setDuplicateLinksData] = useState<SellerOneDuplicateVariantLinksResponse | null>(null);

    const searchParamsFromUrl = useSearchParams();

    const [items, setItems] = useState<SellerOneSupplierProductItem[]>([]);
    const [meta, setMeta] = useState<SellerOneSupplierProductsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchInput, setSearchInput] = useState(
        () => searchParamsFromUrl.get("search") ?? "",
    );
    const [status, setStatus] = useState<SellerOneStatusFilter>("");
    const [stockFilter, setStockFilter] = useState<SellerOneStockFilter>("");
    const [supplierFilter, setSupplierFilter] = useState<"" | PriceParseSupplierCode>("");
    const [page, setPage] = useUrlPage();

    const [manualLink, setManualLink] = useState<ManualLinkState | null>(null);
    const [addToReceiptRow, setAddToReceiptRow] = useState<SellerOneSupplierProductItem | null>(null);
    const [linkingRowId, setLinkingRowId] = useState<number | null>(null);
    const [rulesOpen, setRulesOpen] = useState(false);
    const [rules, setRules] = useState<SellerOneMatchRule[]>([]);
    const [rulePattern, setRulePattern] = useState("");
    const [ruleReplacement, setRuleReplacement] = useState("");
    const [ruleSupplierCode, setRuleSupplierCode] = useState<PriceParseSupplierCode>("edp");
    const [rulesFilterSupplier, setRulesFilterSupplier] = useState<"" | PriceParseSupplierCode>("");
    const [ruleSaving, setRuleSaving] = useState(false);
    const debouncedSearch = useDebouncedValue(searchInput, 350);

    const selectedSupplierName = selectedSupplierCode
        ? (PRICE_PARSE_SUPPLIERS.find((s) => s.code === selectedSupplierCode)?.name ?? selectedSupplierCode)
        : null;

    useEffect(() => {
        const syncActiveJob = async () => {
            try {
                const active = await fetchSellerOneActiveStatus();
                const data = active.data;
                if (
                    data?.job_id
                    && (data.status === "queued" || data.status === "running")
                ) {
                    setActiveJobId(data.job_id);
                    window.localStorage.setItem(SELLER_ONE_ACTIVE_JOB_STORAGE_KEY, data.job_id);
                    setBatchProgress("Восстановление статуса фонового парсинга...");
                    setSupplierPreviewLoading(true);
                }
            } catch {
                // ignore discovery errors; localStorage fallback below
            }
        };

        void syncActiveJob();

        const storedJobId = window.localStorage.getItem(SELLER_ONE_ACTIVE_JOB_STORAGE_KEY);
        if (storedJobId) {
            setActiveJobId(storedJobId);
            setBatchProgress("Восстановление статуса фонового парсинга...");
        }
    }, []);

    const loadRows = useCallback(async (targetPage = page) => {
        setLoading(true);
        setSupplierError("");
        try {
            const data = await fetchSellerOneSupplierProducts({
                search: debouncedSearch || undefined,
                status: status || undefined,
                stock: stockFilter || undefined,
                supplier: supplierFilter || undefined,
                page: targetPage,
            });
            setItems(data.data || []);
            setMeta(data);
        } catch (e: unknown) {
            setSupplierError(e instanceof Error ? e.message : "Ошибка загрузки таблицы");
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, page, status, stockFilter, supplierFilter]);

    const openDuplicateLinksModal = useCallback(async () => {
        setDuplicateLinksOpen(true);
        setDuplicateLinksLoading(true);
        setDuplicateLinksError("");
        setDuplicateLinksData(null);
        try {
            const res = await fetchSellerOneDuplicateVariantLinks();
            setDuplicateLinksData(res.data);
        } catch (e: unknown) {
            setDuplicateLinksError(e instanceof Error ? e.message : "Ошибка загрузки списка дублей");
        } finally {
            setDuplicateLinksLoading(false);
        }
    }, []);

    useResetPageOnChange(setPage, [debouncedSearch, status, stockFilter, supplierFilter]);

    useEffect(() => {
        void loadRows(page);
    }, [loadRows, page, debouncedSearch, status, stockFilter, supplierFilter]);

    useEffect(() => {
        if (!activeJobId) {
            return;
        }

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const poll = async () => {
            try {
                const status = await fetchSellerOneParseStatus(activeJobId);
                if (cancelled) {
                    return;
                }

                const data = status.data;
                if (!data) {
                    setSupplierPreviewLoading(false);
                    setBatchProgress("");
                    window.localStorage.removeItem(SELLER_ONE_ACTIVE_JOB_STORAGE_KEY);
                    setActiveJobId(null);
                    setSupplierError("Фоновая задача парсинга на сервере не найдена (истёк кеш) — состояние сброшено.");
                    return;
                }
                const processed = Number(data.processed ?? 0);
                const totalRows = Number(data.total_rows ?? 0);
                const statusMessage = data.message || "";
                const isPrepMessage =
                    data.status === "running"
                    && statusMessage !== ""
                    && (processed === 0
                        || statusMessage.startsWith("Подготовка:")
                        || statusMessage.startsWith("Продолжение:"));
                const progressText = isPrepMessage
                    ? statusMessage
                    : totalRows > 0
                        ? `Обработано ${processed} / ${totalRows}`
                        : statusMessage || "Выполняется...";
                setBatchProgress(progressText);
                setSupplierPreviewLoading(data.status === "queued" || data.status === "running");

                if (data.status === "completed") {
                    setSupplierPreviewLoading(false);
                    setBatchProgress("");
                    const parseMsg =
                        typeof data.message === "string" && data.message.trim() !== ""
                            ? data.message
                            : "Прайс успешно обработан";
                    const incomplete = totalRows > 0 && processed < totalRows;
                    if (incomplete) {
                        setSupplierSuccess("");
                        setParseDiagnostics(data.parse_diagnostics ?? null);
                        setSupplierError(
                            `Парсинг закрыт преждевременно: обработано ${processed} / ${totalRows}. Перезапустите парсинг.`,
                        );
                    } else {
                        setSupplierError("");
                        setSupplierSuccess(parseMsg);
                        setParseDiagnostics(data.parse_diagnostics ?? null);
                    }
                    window.localStorage.removeItem(SELLER_ONE_ACTIVE_JOB_STORAGE_KEY);
                    setActiveJobId(null);
                    try {
                        await loadRows(1);
                        setPage(1);
                    } catch (reloadError: unknown) {
                        const reloadHint = isTransientNetworkError(reloadError)
                            ? "Парсинг завершён, но сервер не ответил при загрузке таблицы — обновите страницу (F5)."
                            : (reloadError instanceof Error ? reloadError.message : "Ошибка загрузки таблицы после парсинга");
                        setSupplierError(reloadHint);
                    }
                    return;
                }

                if (data.status === "failed") {
                    setSupplierPreviewLoading(false);
                    setBatchProgress("");
                    setSupplierError(data.message || "Ошибка фонового парсинга");
                    window.localStorage.removeItem(SELLER_ONE_ACTIVE_JOB_STORAGE_KEY);
                    setActiveJobId(null);
                    return;
                }

                if (data.status === "cancelled") {
                    setSupplierPreviewLoading(false);
                    setBatchProgress("");
                    setSupplierError("");
                    setSupplierSuccess(data.message || "Парсинг остановлен");
                    window.localStorage.removeItem(SELLER_ONE_ACTIVE_JOB_STORAGE_KEY);
                    setActiveJobId(null);
                    try {
                        await loadRows(page);
                    } catch {
                        // ignore reload errors after cancel
                    }
                    return;
                }
            } catch (e: unknown) {
                if (!cancelled) {
                    if (isTransientNetworkError(e)) {
                        setBatchProgress("Сервер временно недоступен — ждём ответ…");
                        timer = setTimeout(() => {
                            void poll();
                        }, 5000);
                        return;
                    }
                    setSupplierError(e instanceof Error ? e.message : "Ошибка получения статуса парсинга");
                    setSupplierPreviewLoading(false);
                }
                return;
            }

            if (!cancelled) {
                timer = setTimeout(() => {
                    void poll();
                }, 2000);
            }
        };

        void poll();

        return () => {
            cancelled = true;
            if (timer) {
                clearTimeout(timer);
            }
        };
    }, [activeJobId, loadRows, page, setPage]);

    const handleCancelParse = async () => {
        if (!activeJobId && !supplierPreviewLoading) {
            return;
        }

        setCancelParseLoading(true);
        setSupplierError("");
        try {
            const result = await cancelSellerOneParseJob(activeJobId);
            setSupplierPreviewLoading(false);
            setBatchProgress("");
            setSupplierSuccess(result.message || "Парсинг остановлен");
            window.localStorage.removeItem(SELLER_ONE_ACTIVE_JOB_STORAGE_KEY);
            setActiveJobId(null);
            try {
                await loadRows(page);
            } catch {
                // ignore reload errors after cancel
            }
        } catch (e: unknown) {
            setSupplierError(e instanceof Error ? e.message : "Не удалось остановить парсинг");
        } finally {
            setCancelParseLoading(false);
        }
    };

    const handlePreviewSupplierPrice = async () => {
        if (!supplierFile) {
            setSupplierError("Выбери xls/xlsx файл");
            return;
        }
        if (!selectedSupplierCode) {
            setSupplierError("Укажи поставщика для файла");
            return;
        }

        setSupplierPreviewLoading(true);
        setSupplierError("");
        setSupplierSuccess("");
        setParseDiagnostics(null);
        try {
            const data = await startSellerOneParseJob(supplierFile, selectedSupplierCode);
            setActiveJobId(data.job_id);
            window.localStorage.setItem(SELLER_ONE_ACTIVE_JOB_STORAGE_KEY, data.job_id);
            setBatchProgress(`Задача поставлена в очередь (${selectedSupplierName})...`);
        } catch (e: unknown) {
            setBatchProgress("");
            setSupplierPreviewLoading(false);
            setSupplierError(e instanceof Error ? e.message : "Ошибка запуска фонового парсинга");
        }
    };

    const confirmParseFile = (file: File, code: PriceParseSupplierCode) => {
        setSupplierFile(file);
        setSelectedSupplierCode(code);
        setParseFileModalOpen(false);
        setSupplierError("");
    };

    const doForceLink = async (supplierProductId: number, variantId: number) => {
        setLinkingRowId(supplierProductId);
        setSupplierError("");
        try {
            await forceLinkSellerOneProduct({ supplier_product_id: supplierProductId, variant_id: variantId });
            await loadRows(page);
            setSupplierSuccess(`Связка сохранена для строки #${supplierProductId}`);
            if (manualLink?.rowId === supplierProductId) {
                setManualLink(null);
            }
        } catch (e: unknown) {
            setSupplierError(e instanceof Error ? e.message : "Ошибка связывания");
        } finally {
            setLinkingRowId(null);
        }
    };

    const handleToggleParsingActive = async (row: SellerOneSupplierProductItem, checked: boolean) => {
        setLinkingRowId(row.id);
        setSupplierError("");
        try {
            await updateSellerOneSupplierProductParsingActive({
                supplier_product_id: row.id,
                link_parsing_active: checked,
            });
            await loadRows(page);
            setSupplierSuccess(
                checked
                    ? `Парсинг включён для строки #${row.id}`
                    : `Парсинг выключен для строки #${row.id}`,
            );
        } catch (e: unknown) {
            setSupplierError(e instanceof Error ? e.message : "Ошибка обновления участия в парсинге");
        } finally {
            setLinkingRowId(null);
        }
    };

    const handleResetLink = async (supplierProductId: number) => {
        setLinkingRowId(supplierProductId);
        setSupplierError("");
        try {
            await resetSellerOneProductLink({ supplier_product_id: supplierProductId });
            await loadRows(page);
            setSupplierSuccess(`Связка сброшена для строки #${supplierProductId}`);
        } catch (e: unknown) {
            setSupplierError(e instanceof Error ? e.message : "Ошибка сброса связки");
        } finally {
            setLinkingRowId(null);
        }
    };

    const handleToggleLink = async (row: SellerOneSupplierProductItem, checked: boolean) => {
        if (checked) {
            if (!canConfirmSuggestedLink(row)) {
                setSupplierError(
                    row.suggested_variant
                        ? "Автосвязка доступна только при 100% и точном совпадении имени. Выберите связь вручную."
                        : "Нет автокандидата для связывания",
                );
                return;
            }
            await doForceLink(row.id, row.suggested_variant!.id);
            return;
        }

        if (!row.linked_variant && !row.is_linked) {
            return;
        }
        await handleResetLink(row.id);
    };

    const openManualLink = (row: SellerOneSupplierProductItem) => {
        const initialSearch = buildInitialSearchFromRow(row);
        const sourceHint = {
            brand: row.parsed?.brand || "",
            productName: row.parsed?.product_name || row.external_name || "",
            volume: row.parsed?.volume ?? null,
            volumeIsMultipack: Boolean(row.parsed?.volume_is_multipack),
            volumeMultipackCount: row.parsed?.volume_multipack_count ?? null,
            volumeMultipackUnitMl: row.parsed?.volume_multipack_unit_ml ?? null,
            concentration: row.parsed?.concentration ?? null,
            isTester: Boolean(row.parsed?.is_tester),
            isVial: Boolean(row.parsed?.is_vial),
            isMiniature: Boolean(row.parsed?.is_miniature),
        };
        setManualLink({
            rowId: row.id,
            rowName: row.external_name,
            linkSearchBrandId: row.brand?.id ?? null,
            productSearch: initialSearch,
            sourceHint,
            products: [],
            productsLoading: false,
            selectedProductId: null,
            variants: [],
            variantsLoading: false,
            selectedVariantId: null,
            definitionSearch: buildDefinitionSearchFromHint(sourceHint),
            definitions: [],
            definitionsLoading: false,
            attachingDefinition: false,
        });
    };

    const pickManualVariant = (variantId: number) => {
        setManualLink((prev) => (prev ? { ...prev, selectedVariantId: variantId } : prev));
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

            const productSearch = pickedProduct
                ? formatCatalogProductLabel(pickedProduct)
                : prev.productSearch;
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
                        && variants.some(
                            (v) => v.id === preferVariantId && variantMatchesVolumeHint(v, prev.sourceHint),
                        )
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
            setSupplierError(e instanceof Error ? e.message : "Ошибка загрузки вариантов");
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
        setSupplierError("");
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
            setSupplierError(e instanceof Error ? e.message : "Ошибка добавления варианта из справочника");
        } finally {
            setManualLink((prev) => (prev ? { ...prev, attachingDefinition: false } : prev));
        }
    };

    const openRulesModal = async () => {
        setRulesOpen(true);
        try {
            const data = await fetchSellerOneRules(
                rulesFilterSupplier ? { supplier_code: rulesFilterSupplier } : undefined,
            );
            setRules(data.data || []);
        } catch (e: unknown) {
            setSupplierError(e instanceof Error ? e.message : "Ошибка загрузки правил");
        }
    };

    const saveRule = async () => {
        if (!rulePattern.trim() || !ruleReplacement.trim()) {
            setSupplierError("Заполни pattern и replacement");
            return;
        }

        setRuleSaving(true);
        try {
            await createSellerOneRule({
                pattern: rulePattern.trim(),
                replacement: ruleReplacement.trim(),
                supplier_code: ruleSupplierCode,
                is_active: true,
            });
            const data = await fetchSellerOneRules(
                rulesFilterSupplier ? { supplier_code: rulesFilterSupplier } : undefined,
            );
            setRules(data.data || []);
            setRulePattern("");
            setRuleReplacement("");
            setSupplierSuccess("Правило добавлено");
        } catch (e: unknown) {
            setSupplierError(e instanceof Error ? e.message : "Ошибка создания правила");
        } finally {
            setRuleSaving(false);
        }
    };

    const toggleRule = async (rule: SellerOneMatchRule) => {
        await updateSellerOneRule(rule.id, {
            pattern: rule.pattern,
            replacement: rule.replacement,
            is_active: !rule.is_active,
            sort_order: rule.sort_order,
            supplier_code: rule.supplier?.code,
        });
        const data = await fetchSellerOneRules(
            rulesFilterSupplier ? { supplier_code: rulesFilterSupplier } : undefined,
        );
        setRules(data.data || []);
    };

    const removeRule = async (rule: SellerOneMatchRule) => {
        await deleteSellerOneRule(rule.id);
        const data = await fetchSellerOneRules(
            rulesFilterSupplier ? { supplier_code: rulesFilterSupplier } : undefined,
        );
        setRules(data.data || []);
    };

    const resetFilters = () => {
        setSearchInput("");
        setStatus("");
        setStockFilter("");
        setSupplierFilter("");
        setPage(1);
    };

    const hasActiveFilters =
        searchInput.trim() !== "" || status !== "" || stockFilter !== "" || supplierFilter !== "";

    return (
        <AdminPageCard>
            <div className="space-y-4 rounded-2xl border bg-white p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        <h1 className="text-lg font-semibold">Парсинг поставщиков</h1>
                        <p className="mt-1 text-sm text-admin-text-secondary">Парсинг прайса и сопоставление товаров с каталогом</p>
                    </div>

                    <div className="flex w-full min-w-0 flex-row items-center gap-2 md:w-auto md:justify-end">
                        <button
                            type="button"
                            onClick={() => setParseFileModalOpen(true)}
                            className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-admin-text shadow-sm transition hover:border-gray-400 hover:bg-admin-muted"
                        >
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-gray-100 text-[11px] text-admin-text-secondary">
                                +
                            </span>
                            <span>{supplierFile ? "Сменить файл" : "Выбрать файл"}</span>
                        </button>
                        <span className="min-w-0 max-w-[280px] truncate rounded-xl bg-gray-100 px-3 py-1 text-xs text-admin-text-secondary sm:max-w-[360px]">
                            {supplierFile
                                ? `Файл: ${supplierFile.name}${selectedSupplierName ? ` · Поставщик: ${selectedSupplierName}` : ""}`
                                : "Файл не выбран"}
                        </span>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                        type="button"
                        onClick={handlePreviewSupplierPrice}
                        disabled={supplierPreviewLoading || cancelParseLoading || !supplierFile || !selectedSupplierCode}
                        className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
                    >
                        {supplierPreviewLoading
                            ? "Парсинг..."
                            : selectedSupplierName
                              ? `Новый парсинг (${selectedSupplierName})`
                              : "Новый парсинг"}
                    </button>
                    {(supplierPreviewLoading || activeJobId) ? (
                        <button
                            type="button"
                            onClick={() => void handleCancelParse()}
                            disabled={cancelParseLoading}
                            className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800 hover:bg-red-100 disabled:opacity-50"
                        >
                            {cancelParseLoading ? "Остановка..." : "Остановить парсинг"}
                        </button>
                    ) : null}
                    <button type="button" onClick={() => void openRulesModal()} className="rounded-lg border px-4 py-2 text-sm">
                        Правила поиска
                    </button>
                    <button
                        type="button"
                        onClick={() => void openDuplicateLinksModal()}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 hover:bg-amber-100"
                    >
                        Дубли variant_id
                    </button>
                </div>

                {batchProgress ? (
                    <div
                        className={`rounded-lg border px-3 py-2 text-sm ${supplierPreviewLoading
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-admin-border bg-admin-muted text-admin-text"
                            }`}
                    >
                        <span className="font-medium">
                            {supplierPreviewLoading ? "Прогресс парсинга: " : "Последний запуск: "}
                        </span>
                        {batchProgress}
                    </div>
                ) : null}

                {supplierError ? <AlertMessage message={supplierError} onCloseAction={() => setSupplierError("")} /> : null}
                {supplierSuccess ? <SuccessMessage message={supplierSuccess} onCloseAction={() => setSupplierSuccess("")} /> : null}
                {parseDiagnostics ? (
                    <ParseDiagnosticsPanel
                        diagnostics={parseDiagnostics}
                        onCloseAction={() => setParseDiagnostics(null)}
                        onShowAllDuplicatesAction={() => void openDuplicateLinksModal()}
                    />
                ) : null}

                <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                        <AdminStatusDropdown
                            value={supplierFilter}
                            onChangeAction={(value) => setSupplierFilter(value as "" | PriceParseSupplierCode)}
                            options={[
                                { value: "", label: "Поставщик" },
                                ...PRICE_PARSE_SUPPLIERS.map((s) => ({ value: s.code, label: s.name })),
                            ]}
                            widthClassName="w-max"
                            menuWidthClassName="w-max"
                        />
                        <AdminStatusDropdown
                            value={status}
                            onChangeAction={(value) => setStatus(value as SellerOneStatusFilter)}
                            options={[
                                { value: "", label: "Статусы" },
                                ...STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
                            ]}
                            widthClassName="w-max"
                            menuWidthClassName="w-max"
                        />
                        <AdminStatusDropdown
                            value={stockFilter}
                            onChangeAction={(value) => setStockFilter(value as SellerOneStockFilter)}
                            options={[
                                { value: "", label: "Наличие" },
                                ...STOCK_FILTER_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
                            ]}
                            widthClassName="w-max"
                            menuWidthClassName="w-max"
                        />
                        {hasActiveFilters ? (
                            <button
                                type="button"
                                onClick={resetFilters}
                                className="inline-flex h-10 shrink-0 items-center rounded-lg border border-admin-border bg-admin-surface px-3 text-xs whitespace-nowrap text-admin-text-secondary transition hover:bg-admin-muted"
                            >
                                Сбросить
                            </button>
                        ) : null}
                    </div>
                    <AdminSearchInput value={searchInput} onChangeAction={setSearchInput} placeholder="Поиск по товару поставщика" />
                </div>

                {loading ? <div className="rounded-xl border px-4 py-5 text-sm text-admin-text-secondary">Загрузка таблицы...</div> : null}

                {!loading && items.length > 0 ? (
                    <div className="space-y-4">
                        <div className="w-full rounded-lg border bg-admin-muted px-4 py-3">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-admin-text-secondary">
                                <span className="font-medium text-admin-text">
                                    Всего: {meta?.total ?? items.length}
                                </span>
                                <span>
                                    Связанные: {meta?.stats?.confirmed ?? 0}
                                </span>
                                <span>
                                    Не связанные: {meta?.stats?.unlinked ?? 0}
                                </span>
                                <span>
                                    Новые: {meta?.stats?.new ?? 0}
                                </span>
                                <span>
                                    Есть кандидат: {meta?.stats?.found_unconfirmed ?? 0}
                                </span>
                                <span>
                                    Парсинг выкл.: {meta?.stats?.parsing_inactive ?? 0}
                                </span>
                                {meta?.stats?.last_price_apply_at ? (
                                    <span className="ml-auto text-admin-text-secondary">
                                        Обновление цен:{" "}
                                        {new Date(meta.stats.last_price_apply_at).toLocaleString("ru-RU")}
                                        {meta.stats.last_price_apply_file_name
                                            ? ` · ${meta.stats.last_price_apply_file_name}`
                                            : ""}
                                    </span>
                                ) : (
                                    <span className="ml-auto text-gray-400">
                                        Обновление цен: ещё не применялось
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="min-w-0 overflow-x-auto rounded-xl border">
                            <table className="w-full min-w-[960px] table-fixed text-sm">
                                <colgroup>
                                    <col style={{ width: "44px" }} />
                                    <col style={{ width: "56px" }} />
                                    <col style={{ width: "128px" }} />
                                    <col style={{ width: "76px" }} />
                                    <col />
                                    <col style={{ width: "132px" }} />
                                    <col style={{ width: "56px" }} />
                                    <col />
                                </colgroup>
                                <thead className="bg-admin-muted">
                                    <tr className="text-left text-xs">
                                        <th className="px-1 py-2 text-center font-medium whitespace-nowrap">Связь</th>
                                        <th
                                            className="px-1 py-2 text-center font-medium whitespace-nowrap"
                                            title="Участие в парсинге прайса"
                                        >
                                            Парсинг
                                        </th>
                                        <th className="px-1.5 py-2 font-medium whitespace-nowrap">Код</th>
                                        <th className="px-1.5 py-2 font-medium whitespace-nowrap">Поставщик</th>
                                        <th className="px-2 py-2 font-medium">Товар поставщика</th>
                                        <th className="px-2 py-2 font-medium whitespace-nowrap">Статус</th>
                                        <th className="px-1 py-2 text-center font-medium whitespace-nowrap">Наличие</th>
                                        <th className="px-2 py-2 font-medium">Продукт каталога</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((row) => {
                                        const catalogProductLabel = getRowCatalogProductLabel(row);
                                        const nameMatchInfo = catalogProductLabel
                                            ? findSellerOneRowNameMatchInfo(row, catalogProductLabel)
                                            : {
                                                words: [],
                                                catalogWords: [],
                                                exact: false,
                                                brandPrefix: null,
                                                catalogBrandPrefix: null,
                                            };

                                        return (
                                            <tr key={row.id} className="border-t align-top">
                                                <td className="px-1 py-3 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(row.is_linked)}
                                                        disabled={linkingRowId === row.id || !canConfirmSuggestedLink(row)}
                                                        title={
                                                            !canConfirmSuggestedLink(row) && !row.is_linked
                                                                ? "Галочка только при 100% и точном имени; иначе — ручная связка"
                                                                : undefined
                                                        }
                                                        onChange={(e) => void handleToggleLink(row, e.target.checked)}
                                                        className="h-4 w-4 cursor-pointer rounded border border-gray-400 accent-blue-600 shadow-sm focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed"
                                                    />
                                                </td>
                                                <td className="px-1 py-3 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={row.link_parsing_active !== false}
                                                        disabled={linkingRowId === row.id}
                                                        title="Активное участие в парсинге (код из файла обрабатывается)"
                                                        onChange={(e) => void handleToggleParsingActive(row, e.target.checked)}
                                                        className="h-4 w-4 cursor-pointer rounded border border-gray-400 accent-blue-600 shadow-sm focus:ring-2 focus:ring-blue-200"
                                                    />
                                                </td>
                                                <td className="whitespace-nowrap px-1.5 py-3 font-medium">
                                                    {row.code ? (
                                                        <span className="inline-flex items-center gap-0.5">
                                                            <CopyText
                                                                value={row.code}
                                                                label={highlightAdminSearchTerms(
                                                                    row.code,
                                                                    debouncedSearch,
                                                                )}
                                                                title="Скопировать код поставщика"
                                                                iconSize={12}
                                                                className="!px-1"
                                                            />
                                                            {row.is_linked && row.linked_variant ? (
                                                                <button
                                                                    type="button"
                                                                    title="Добавить в приход"
                                                                    onClick={() => setAddToReceiptRow(row)}
                                                                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-emerald-700 hover:bg-emerald-50"
                                                                >
                                                                    <PackagePlus size={14} />
                                                                </button>
                                                            ) : null}
                                                        </span>
                                                    ) : (
                                                        "—"
                                                    )}
                                                </td>
                                                <td className="whitespace-nowrap px-1.5 py-3 text-xs text-admin-text">
                                                    {row.supplier?.name ?? "—"}
                                                </td>
                                                <td className="px-2 py-3">
                                                    <HighlightedNameText
                                                        text={row.external_name}
                                                        matchInfo={nameMatchInfo}
                                                        className="break-words font-medium"
                                                    />
                                                    <div className="text-xs text-admin-text-secondary">Цена: {row.supplier_price ?? "—"}</div>
                                                </td>
                                                <td className="whitespace-nowrap px-2 py-3">
                                                    {row.status === "confirmed" ? (
                                                        <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">Подтверждено</span>
                                                    ) : row.status === "found_unconfirmed" ? (
                                                        <ConfidenceBadge label="Найдена связь" confidence={row.match_confidence} />
                                                    ) : row.status === "new" ? (
                                                        <ConfidenceBadge label="Новый" confidence={row.match_confidence} />
                                                    ) : (
                                                        <ConfidenceBadge label="Не связан" confidence={row.match_confidence} />
                                                    )}
                                                </td>
                                                <td className="px-1 py-3 text-center text-xs text-admin-text">
                                                    {row.price_file_in_stock === true ? (
                                                        <span className="font-medium text-green-700">Да</span>
                                                    ) : (
                                                        <span className="font-medium text-amber-800">Нет</span>
                                                    )}
                                                </td>
                                                <td
                                                    className="cursor-pointer px-2 py-3 text-xs whitespace-normal break-words"
                                                    onClick={() => {
                                                        openManualLink(row);
                                                    }}
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
                                                                {row.linked_variant.display || "Вариант без параметров"}
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
                                                                {row.suggested_variant.display || "Вариант без параметров"}
                                                            </div>
                                                            {isSimilarProductMatch(row.match_confidence_breakdown) ? (
                                                                <div className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
                                                                    {getSuggestedProductOnlyMessage(
                                                                        row.match_confidence_breakdown,
                                                                        0,
                                                                    )}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    ) : row.suggested_product ? (
                                                        <div>
                                                            <HighlightedNameText
                                                                text={
                                                                    row.suggested_product.display_name
                                                                    || row.suggested_product.name
                                                                    || ""
                                                                }
                                                                matchInfo={nameMatchInfo}
                                                                highlightSource="catalog"
                                                                className="break-words font-medium"
                                                            />
                                                            <div className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
                                                                {getSuggestedProductOnlyMessage(
                                                                    row.match_confidence_breakdown,
                                                                    row.suggested_product.variants_count ?? 0,
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : row.linked_variant ? (
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
                                                                {row.linked_variant.display || "Вариант без параметров"}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="inline-block origin-left text-admin-text-secondary transition-all duration-150 hover:scale-[1.03] hover:text-admin-text">
                                                            Выберите связь
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <AdminPagination currentPage={meta?.current_page ?? 1} lastPage={meta?.last_page ?? 1} onPrevAction={() => setPage((p) => Math.max(1, p - 1))} onNextAction={() => setPage((p) => (meta && meta.current_page < meta.last_page ? p + 1 : p))} />
                    </div>
                ) : null}

                {!loading && items.length === 0 ? <div className="rounded-xl border px-4 py-5 text-sm text-admin-text-secondary">Нет данных. Загрузи прайс или измени фильтры.</div> : null}

                {manualLink ? (
                    <ManualLinkSearchHost
                        key={manualLink.rowId}
                        manualLink={manualLink}
                        setManualLink={setManualLink}
                        setSupplierError={setSupplierError}
                        pickProduct={pickProduct}
                        attachDefinitionFromDictionary={attachDefinitionFromDictionary}
                        linkingRowId={linkingRowId}
                        onConfirmAction={doForceLink}
                        onPickVariantAction={pickManualVariant}
                    />
                ) : null}

                {addToReceiptRow ? (
                    <AddToReceiptModal
                        row={addToReceiptRow}
                        onClose={() => setAddToReceiptRow(null)}
                    />
                ) : null}

                <RulesModal
                    open={rulesOpen}
                    rules={rules}
                    rulePattern={rulePattern}
                    ruleReplacement={ruleReplacement}
                    ruleSupplierCode={ruleSupplierCode}
                    rulesFilterSupplier={rulesFilterSupplier}
                    ruleSaving={ruleSaving}
                    onCloseAction={() => setRulesOpen(false)}
                    onPatternChangeAction={setRulePattern}
                    onReplacementChangeAction={setRuleReplacement}
                    onSupplierChangeAction={setRuleSupplierCode}
                    onFilterSupplierChangeAction={async (value) => {
                        setRulesFilterSupplier(value);
                        try {
                            const data = await fetchSellerOneRules(
                                value ? { supplier_code: value } : undefined,
                            );
                            setRules(data.data || []);
                        } catch (e: unknown) {
                            setSupplierError(e instanceof Error ? e.message : "Ошибка загрузки правил");
                        }
                    }}
                    onCreateAction={saveRule}
                    onToggleRuleAction={toggleRule}
                    onDeleteRuleAction={removeRule}
                />
                <ParseFileModal
                    open={parseFileModalOpen}
                    initialSupplierCode={selectedSupplierCode}
                    initialFile={supplierFile}
                    onCloseAction={() => setParseFileModalOpen(false)}
                    onConfirmAction={confirmParseFile}
                />
                {duplicateLinksOpen ? (
                    <DuplicateVariantLinksModal
                        data={duplicateLinksData}
                        loading={duplicateLinksLoading}
                        error={duplicateLinksError}
                        onCloseAction={() => setDuplicateLinksOpen(false)}
                    />
                ) : null}
            </div>
        </AdminPageCard>
    );
}

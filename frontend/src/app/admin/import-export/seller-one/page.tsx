"use client";

import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import AdminFilterSelect from "@/components/admin/ui/admin-filter-select";
import AdminPagination from "@/components/admin/ui/admin-pagination";
import CopyText from "@/components/ui/copy-text";
import useDebouncedValue from "@/hooks/use-debounced-value";
import useUrlPage, { useResetPageOnChange } from "@/hooks/use-url-page";
import {
    createSellerOneRule,
    deleteSellerOneRule,
    fetchSellerOneParseStatus,
    fetchSellerOneRefreshLinkedJobStatus,
    fetchSellerOneSupplierProducts,
    fetchSellerOnePricingSettings,
    fetchSellerOneRules,
    forceLinkSellerOneProduct,
    startSellerOneRefreshLinkedPricesJob,
    resetSellerOneProductLink,
    startSellerOneParseJob,
    updateSellerOneSupplierProductParsingActive,
    updateSellerOnePricingSettings,
    updateSellerOneRule,
} from "@/lib/admin-vanille-api";
import type {
    SellerOneMatchRule,
    SellerOnePricingSettings,
    SellerOneSupplierProductItem,
    SellerOneSupplierProductsResponse,
} from "@/types/Vanille";
import { fetchProducts, type ProductAdminItem } from "@/lib/admin-products-api";
import {
    createProductVariant,
    fetchProductVariants,
    fetchVariantDefinitions,
} from "@/lib/admin-product-variants-api";
import {
    STATUS_OPTIONS,
    type SellerOneStatusFilter,
    SELLER_ONE_DEFINITION_SEARCH_DEBOUNCE_MS,
    SELLER_ONE_FILE_ACCEPT,
    SELLER_ONE_PRODUCT_SEARCH_DEBOUNCE_MS,
} from "@/components/admin/import-export/seller-one/constants";
import {
    buildInitialSearchFromRow,
    buildSearchCandidates,
    isExactProductNameMatch,
    rankProducts,
} from "@/components/admin/import-export/seller-one/utils";
import { type ManualLinkState } from "@/components/admin/import-export/seller-one/types";
import {
    AlertMessage,
    ConfidenceBadge,
    ManualLinkModal,
    PricingSettingsModal,
    RulesModal,
    SuccessMessage,
} from "@/components/admin/import-export/seller-one/ui";

type ManualLinkSearchHostProps = {
    manualLink: ManualLinkState;
    setManualLink: Dispatch<SetStateAction<ManualLinkState | null>>;
    setSupplierError: Dispatch<SetStateAction<string>>;
    loadManualVariants: (productId: number, preferVariantId?: number) => Promise<void>;
    attachDefinitionFromDictionary: (definitionId: number) => Promise<void>;
    linkingRowId: number | null;
    onConfirmAction: (rowId: number, variantId: number) => Promise<void>;
};

function ManualLinkSearchHost({
    manualLink,
    setManualLink,
    setSupplierError,
    loadManualVariants,
    attachDefinitionFromDictionary,
    linkingRowId,
    onConfirmAction,
}: ManualLinkSearchHostProps) {
    const debouncedProductSearch = useDebouncedValue(manualLink.productSearch, SELLER_ONE_PRODUCT_SEARCH_DEBOUNCE_MS);
    const debouncedDefinitionSearch = useDebouncedValue(manualLink.definitionSearch, SELLER_ONE_DEFINITION_SEARCH_DEBOUNCE_MS);

    useEffect(() => {
        const rowId = manualLink.rowId;
        let cancelled = false;

        const run = async () => {
            setManualLink((prev) => (prev && prev.rowId === rowId ? { ...prev, productsLoading: true } : prev));
            try {
                const query = debouncedProductSearch.trim();
                const candidates = buildSearchCandidates(query);
                let products: ProductAdminItem[] = [];

                for (const candidate of candidates) {
                    const data = await fetchProducts({ search: candidate || undefined, page: 1 });
                    const current = data.data || [];
                    if (current.length > 0) {
                        products = rankProducts(current, query);
                        break;
                    }
                }

                if (cancelled) {
                    return;
                }

                setManualLink((prev) => {
                    if (!prev || prev.rowId !== rowId) {
                        return prev;
                    }
                    const keepProduct =
                        prev.selectedProductId != null
                        && products.some((p) => p.id === prev.selectedProductId);
                    return {
                        ...prev,
                        products,
                        productsLoading: false,
                        selectedProductId: keepProduct ? prev.selectedProductId : null,
                        selectedVariantId: keepProduct ? prev.selectedVariantId : null,
                        variants: keepProduct ? prev.variants : [],
                        variantsLoading: keepProduct ? prev.variantsLoading : false,
                    };
                });
            } catch (e: unknown) {
                if (!cancelled) {
                    setManualLink((prev) => (prev && prev.rowId === rowId ? { ...prev, productsLoading: false } : prev));
                    setSupplierError(e instanceof Error ? e.message : "Ошибка поиска товаров");
                }
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [manualLink.rowId, debouncedProductSearch, setManualLink, setSupplierError]);

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
            linkingRowId={linkingRowId}
            setManualLink={setManualLink}
            onCloseAction={() => setManualLink(null)}
            onPickProductAction={loadManualVariants}
            onPickDefinitionAction={attachDefinitionFromDictionary}
            onConfirmAction={onConfirmAction}
        />
    );
}

const SELLER_ONE_ACTIVE_JOB_STORAGE_KEY = "seller-one-active-job-id";

const SELLER_ONE_REFRESH_LINKED_JOB_STORAGE_KEY = "seller-one-refresh-linked-job-id";

export default function SellerOneImportPage() {
    const [supplierFile, setSupplierFile] = useState<File | null>(null);
    const [supplierPreviewLoading, setSupplierPreviewLoading] = useState(false);
    const [supplierRefreshPricesLoading, setSupplierRefreshPricesLoading] = useState(false);
    const [batchProgress, setBatchProgress] = useState("");
    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const [refreshLinkedJobId, setRefreshLinkedJobId] = useState<string | null>(null);
    const [supplierError, setSupplierError] = useState("");
    const [supplierSuccess, setSupplierSuccess] = useState("");

    const searchParamsFromUrl = useSearchParams();

    const [items, setItems] = useState<SellerOneSupplierProductItem[]>([]);
    const [meta, setMeta] = useState<SellerOneSupplierProductsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchInput, setSearchInput] = useState(
        () => searchParamsFromUrl.get("search") ?? "",
    );
    const [status, setStatus] = useState<SellerOneStatusFilter>("");
    const [page, setPage] = useUrlPage();

    const [manualLink, setManualLink] = useState<ManualLinkState | null>(null);
    const [linkingRowId, setLinkingRowId] = useState<number | null>(null);
    const [rulesOpen, setRulesOpen] = useState(false);
    const [rules, setRules] = useState<SellerOneMatchRule[]>([]);
    const [rulePattern, setRulePattern] = useState("");
    const [ruleReplacement, setRuleReplacement] = useState("");
    const [ruleSaving, setRuleSaving] = useState(false);
    const [pricingOpen, setPricingOpen] = useState(false);
    const [pricingSaving, setPricingSaving] = useState(false);
    const [pricingForm, setPricingForm] = useState<SellerOnePricingSettings>({
        price_markup: 1.28,
        price_rate: 3.15,
        price_fixed_fee: 7,
        price_precision: 1,
    });
    const debouncedSearch = useDebouncedValue(searchInput, 350);

    useEffect(() => {
        const storedJobId = window.localStorage.getItem(SELLER_ONE_ACTIVE_JOB_STORAGE_KEY);
        if (storedJobId) {
            setActiveJobId(storedJobId);
            setBatchProgress("Восстановление статуса фонового парсинга...");
        }
        const storedRefreshId = window.localStorage.getItem(SELLER_ONE_REFRESH_LINKED_JOB_STORAGE_KEY);
        if (storedRefreshId) {
            setRefreshLinkedJobId(storedRefreshId);
            setBatchProgress((prev) => (prev ? prev : "Восстановление статуса обновления цен…"));
        }
    }, []);

    const loadRows = useCallback(async (targetPage = page) => {
        setLoading(true);
        setSupplierError("");
        try {
            const data = await fetchSellerOneSupplierProducts({
                search: debouncedSearch || undefined,
                status: status || undefined,
                page: targetPage,
            });
            setItems(data.data || []);
            setMeta(data);
        } catch (e: unknown) {
            setSupplierError(e instanceof Error ? e.message : "Ошибка загрузки таблицы");
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, page, status]);

    useResetPageOnChange(setPage, [debouncedSearch, status]);

    useEffect(() => {
        void loadRows(page);
    }, [loadRows, page, debouncedSearch, status]);

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
                const processed = Number(data.processed ?? 0);
                const totalRows = Number(data.total_rows ?? 0);
                const progressText = totalRows > 0
                    ? `Обработано ${processed} / ${totalRows}`
                    : data.message || "Выполняется...";
                setBatchProgress(progressText);
                setSupplierPreviewLoading(data.status === "queued" || data.status === "running");

                if (data.status === "completed") {
                    setSupplierPreviewLoading(false);
                    setBatchProgress("");
                    setSupplierSuccess("Прайс успешно обработан и таблица обновлена");
                    window.localStorage.removeItem(SELLER_ONE_ACTIVE_JOB_STORAGE_KEY);
                    setActiveJobId(null);
                    await loadRows(1);
                    setPage(1);
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
            } catch (e: unknown) {
                if (!cancelled) {
                    setSupplierError(e instanceof Error ? e.message : "Ошибка получения статуса парсинга");
                    setSupplierPreviewLoading(false);
                    window.localStorage.removeItem(SELLER_ONE_ACTIVE_JOB_STORAGE_KEY);
                    setActiveJobId(null);
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
    }, [activeJobId, loadRows, setPage]);

    useEffect(() => {
        if (!refreshLinkedJobId) {
            return;
        }

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const poll = async () => {
            try {
                const res = await fetchSellerOneRefreshLinkedJobStatus(refreshLinkedJobId);
                if (cancelled) {
                    return;
                }

                const data = res.data;
                const processed = Number(data.processed ?? 0);
                const totalLinked = Number(data.total_linked ?? 0);
                const progressText =
                    totalLinked > 0
                        ? `Обновление цен: ${processed} / ${totalLinked}`
                        : data.message || "Выполняется…";
                setBatchProgress(progressText);
                setSupplierRefreshPricesLoading(data.status === "queued" || data.status === "running");

                if (data.status === "completed") {
                    setSupplierRefreshPricesLoading(false);
                    setBatchProgress("");
                    const shelf = Number(data.cleared_supplier_shelf_variants ?? 0);
                    const priceChanged = Number(data.price_changed ?? 0);
                    const outStock = Number(data.became_out_of_stock ?? 0);
                    const inStock = Number(data.became_in_stock ?? 0);
                    const msg =
                        (typeof data.message === "string" && data.message.trim() !== "")
                            ? data.message
                            : `Цены: обработано ${data.updated ?? 0}, цена изменилась — ${priceChanged}, стало «нет в наличии» — ${outStock}, «в наличии» — ${inStock}, нет кода в файле — ${data.missing_codes ?? 0}${
                                shelf > 0 ? `, снято с вирт. склада поставщика (вариантов): ${shelf}` : ""
                            }`;
                    setSupplierSuccess(msg);
                    window.localStorage.removeItem(SELLER_ONE_REFRESH_LINKED_JOB_STORAGE_KEY);
                    setRefreshLinkedJobId(null);
                    await loadRows(page);
                    return;
                }

                if (data.status === "failed") {
                    setSupplierRefreshPricesLoading(false);
                    setBatchProgress("");
                    setSupplierError(data.message || "Ошибка обновления цен");
                    window.localStorage.removeItem(SELLER_ONE_REFRESH_LINKED_JOB_STORAGE_KEY);
                    setRefreshLinkedJobId(null);
                    return;
                }
            } catch (e: unknown) {
                if (!cancelled) {
                    setSupplierError(e instanceof Error ? e.message : "Ошибка получения статуса обновления цен");
                    setSupplierRefreshPricesLoading(false);
                    window.localStorage.removeItem(SELLER_ONE_REFRESH_LINKED_JOB_STORAGE_KEY);
                    setRefreshLinkedJobId(null);
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
    }, [refreshLinkedJobId, loadRows, page]);

    const handlePreviewSupplierPrice = async () => {
        if (!supplierFile) {
            setSupplierError("Выбери xls/xlsx файл");
            return;
        }

        setSupplierPreviewLoading(true);
        setSupplierError("");
        setSupplierSuccess("");
        try {
            const data = await startSellerOneParseJob(supplierFile);
            setActiveJobId(data.job_id);
            window.localStorage.setItem(SELLER_ONE_ACTIVE_JOB_STORAGE_KEY, data.job_id);
            setBatchProgress("Задача поставлена в очередь...");
        } catch (e: unknown) {
            setBatchProgress("");
            setSupplierPreviewLoading(false);
            setSupplierError(e instanceof Error ? e.message : "Ошибка запуска фонового парсинга");
        }
    };

    const handleRefreshLinkedPrices = async () => {
        if (!supplierFile) {
            setSupplierError("Выбери xls/xlsx файл");
            return;
        }
        setSupplierRefreshPricesLoading(true);
        setSupplierError("");
        setSupplierSuccess("");
        setBatchProgress("");
        try {
            const data = await startSellerOneRefreshLinkedPricesJob(supplierFile);
            setRefreshLinkedJobId(data.job_id);
            window.localStorage.setItem(SELLER_ONE_REFRESH_LINKED_JOB_STORAGE_KEY, data.job_id);
            setBatchProgress("Задача обновления цен поставлена в очередь…");
        } catch (e: unknown) {
            setBatchProgress("");
            setSupplierRefreshPricesLoading(false);
            setSupplierError(e instanceof Error ? e.message : "Ошибка запуска обновления цен");
        }
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
            if (!row.suggested_variant) {
                setSupplierError("Нет автокандидата для связывания");
                return;
            }
            await doForceLink(row.id, row.suggested_variant.id);
            return;
        }

        if (!row.linked_variant && !row.is_linked) {
            return;
        }
        await handleResetLink(row.id);
    };

    const openManualLink = (row: SellerOneSupplierProductItem) => {
        const initialSearch = buildInitialSearchFromRow(row);
        setManualLink({
            rowId: row.id,
            rowName: row.external_name,
            productSearch: initialSearch,
            sourceHint: {
                brand: row.parsed?.brand || "",
                productName: row.parsed?.product_name || row.external_name || "",
                volume: row.parsed?.volume ?? null,
                concentration: row.parsed?.concentration ?? null,
                isTester: Boolean(row.parsed?.is_tester),
            },
            products: [],
            productsLoading: false,
            selectedProductId: null,
            variants: [],
            variantsLoading: false,
            selectedVariantId: null,
            definitionSearch: "",
            definitions: [],
            definitionsLoading: false,
            attachingDefinition: false,
        });
    };

    const loadManualVariants = async (productId: number, preferVariantId?: number) => {
        setManualLink((prev) =>
            prev
                ? {
                    ...prev,
                    selectedProductId: productId,
                    variants: [],
                    selectedVariantId: null,
                    variantsLoading: true,
                    definitions: [],
                    definitionSearch: "",
                    definitionsLoading: false,
                }
                : prev
        );
        try {
            const data = await fetchProductVariants(productId);
            const variants = data.data || [];
            setManualLink((prev) => {
                if (!prev) {
                    return prev;
                }

                const normalizedHintConcentration = (prev.sourceHint.concentration || "").trim().toLowerCase();
                const hintVolume = prev.sourceHint.volume;

                let bestVariantId: number | null = null;
                let bestScore = -1;

                for (const variant of variants) {
                    let score = 0;
                    const variantVolume = variant.volume != null ? Number(variant.volume) : null;
                    const variantConcentration = (variant.concentration || "").trim().toLowerCase();

                    if (
                        hintVolume != null &&
                        variantVolume != null &&
                        Math.abs(variantVolume - hintVolume) <= 0.01
                    ) {
                        score += 70;
                    }

                    if (normalizedHintConcentration && variantConcentration === normalizedHintConcentration) {
                        score += 30;
                    }

                    if (score > bestScore) {
                        bestScore = score;
                        bestVariantId = variant.id;
                    }
                }

                const preferred =
                    preferVariantId && variants.some((v) => v.id === preferVariantId)
                        ? preferVariantId
                        : bestScore > 0
                            ? bestVariantId
                            : null;

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
            const data = await fetchSellerOneRules();
            setRules(data.data || []);
        } catch (e: unknown) {
            setSupplierError(e instanceof Error ? e.message : "Ошибка загрузки правил");
        }
    };

    const openPricingModal = async () => {
        setPricingOpen(true);
        try {
            const data = await fetchSellerOnePricingSettings();
            setPricingForm(data.data);
        } catch (e: unknown) {
            setSupplierError(e instanceof Error ? e.message : "Ошибка загрузки формулы цены");
        }
    };

    const savePricingSettings = async () => {
        setPricingSaving(true);
        try {
            const response = await updateSellerOnePricingSettings(pricingForm);
            setPricingForm(response.data);
            setSupplierSuccess("Формула цены обновлена");
            setPricingOpen(false);
        } catch (e: unknown) {
            setSupplierError(e instanceof Error ? e.message : "Ошибка сохранения формулы цены");
        } finally {
            setPricingSaving(false);
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
                is_active: true,
            });
            const data = await fetchSellerOneRules();
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
        });
        const data = await fetchSellerOneRules();
        setRules(data.data || []);
    };

    const removeRule = async (rule: SellerOneMatchRule) => {
        await deleteSellerOneRule(rule.id);
        const data = await fetchSellerOneRules();
        setRules(data.data || []);
    };

    const resetFilters = () => {
        setSearchInput("");
        setStatus("");
        setPage(1);
    };

    return (
        <AdminPageCard>
            <div className="space-y-4 rounded-2xl border bg-white p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        <h1 className="text-lg font-semibold">Seller One</h1>
                        <p className="mt-1 text-sm text-gray-500">Пасринг парйса и сопоставление товаров с каталогом</p>
                    </div>

                    <div className="flex flex-col items-start gap-1 md:items-end">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm transition hover:border-gray-400 hover:bg-gray-50 focus-within:ring-2 focus-within:ring-blue-200">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-gray-100 text-[11px] text-gray-600">
                                +
                            </span>
                            <span>{supplierFile ? "Сменить файл" : "Выбрать файл"}</span>
                            <input
                                type="file"
                                accept={SELLER_ONE_FILE_ACCEPT}
                                onChange={(e) => setSupplierFile(e.target.files?.[0] || null)}
                                className="sr-only"
                            />
                        </label>
                        <span className="max-w-[320px] truncate rounded-xl bg-gray-100 px-3 py-1 text-xs text-gray-600">
                            {supplierFile ? `Файл: ${supplierFile.name}` : "Файл не выбран"}
                        </span>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                        type="button"
                        onClick={handlePreviewSupplierPrice}
                        disabled={
                            supplierPreviewLoading
                            || supplierRefreshPricesLoading
                            || !!refreshLinkedJobId
                            || !supplierFile
                        }
                        className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                    >
                        {supplierPreviewLoading ? "Парсинг..." : "Новый парсинг"}
                    </button>
                    <button
                        type="button"
                        onClick={handleRefreshLinkedPrices}
                        disabled={
                            supplierRefreshPricesLoading
                            || supplierPreviewLoading
                            || !!activeJobId
                            || !supplierFile
                        }
                        className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                    >
                        {supplierRefreshPricesLoading ? "Обновление..." : "Обновить цены"}
                    </button>
                    <button type="button" onClick={() => void openRulesModal()} className="rounded-xl border px-4 py-2 text-sm">
                        Правила поиска
                    </button>
                    <button type="button" onClick={() => void openPricingModal()} className="rounded-xl border px-4 py-2 text-sm">
                        Формула цены
                    </button>
                </div>

                {batchProgress ? (
                    <div
                        className={`rounded-xl border px-3 py-2 text-sm ${
                            supplierPreviewLoading || supplierRefreshPricesLoading
                                ? "border-blue-200 bg-blue-50 text-blue-700"
                                : "border-gray-200 bg-gray-50 text-gray-700"
                        }`}
                    >
                        <span className="font-medium">
                            {supplierPreviewLoading
                                ? "Прогресс парсинга: "
                                : supplierRefreshPricesLoading
                                    ? "Прогресс обновления цен: "
                                    : "Последний запуск: "}
                        </span>
                        {batchProgress}
                    </div>
                ) : null}

                {supplierError ? <AlertMessage message={supplierError} onCloseAction={() => setSupplierError("")} /> : null}
                {supplierSuccess ? <SuccessMessage message={supplierSuccess} onCloseAction={() => setSupplierSuccess("")} /> : null}

                <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between">
                    <AdminSearchInput value={searchInput} onChangeAction={setSearchInput} placeholder="Поиск по товару поставщика" />
                    <div className="flex items-center gap-2">
                        <AdminFilterSelect value={status} onChangeAction={(value) => setStatus(value as SellerOneStatusFilter)} options={STATUS_OPTIONS as unknown as Array<{ value: string; label: string }>} placeholder="Все статусы" />
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="rounded-xl border px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
                        >
                            Сбросить фильтры
                        </button>
                    </div>
                </div>

                {loading ? <div className="rounded-xl border px-4 py-5 text-sm text-gray-500">Загрузка таблицы...</div> : null}

                {!loading && items.length > 0 ? (
                    <div className="space-y-4">
                        <div className="w-full rounded-xl border bg-gray-50 px-4 py-3">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-600">
                                <span className="font-medium text-gray-700">
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
                            </div>
                        </div>
                        <div className="rounded-xl border">
                            <table className="w-full table-fixed text-sm">
                                <colgroup>
                                    <col style={{ width: "44px" }} />
                                    <col style={{ width: "52px" }} />
                                    <col style={{ width: "84px" }} />
                                    <col style={{ width: "30%" }} />
                                    {/* 180px чтобы поместился самый длинный бэйдж «Найдена связь (100%)» без overflow в колонку «Продукт каталога». */}
                                    <col style={{ width: "160px" }} />
                                    <col style={{ width: "120px" }} />
                                    <col style={{ width: "38%" }} />
                                </colgroup>
                                <thead className="bg-gray-50">
                                    <tr className="text-left">
                                        <th className="px-2 py-2 text-center">Связь</th>
                                        <th className="px-1 py-2 text-center text-[11px] leading-tight" title="Участие в парсинге прайса">
                                            Парсинг
                                        </th>
                                        <th className="px-2 py-2">Код</th>
                                        <th className="px-3 py-2">Товар поставщика</th>
                                        <th className="px-2 py-2 whitespace-nowrap">Статус</th>
                                        <th className="px-2 py-2 whitespace-nowrap">Наличие</th>
                                        <th className="px-3 py-2">Продукт каталога</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((row) => (
                                        <tr key={row.id} className="border-t align-top">
                                            <td className="px-2 py-3 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(row.is_linked)}
                                                    disabled={linkingRowId === row.id || (!row.is_linked && !row.suggested_variant)}
                                                    onChange={(e) => void handleToggleLink(row, e.target.checked)}
                                                    className="h-4 w-4 cursor-pointer rounded border border-gray-400 accent-blue-600 shadow-sm focus:ring-2 focus:ring-blue-200"
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
                                            <td className="whitespace-nowrap px-2 py-3 font-medium">
                                                {row.code ? (
                                                    <CopyText
                                                        value={row.code}
                                                        title="Скопировать код поставщика"
                                                        iconSize={12}
                                                    />
                                                ) : (
                                                    "—"
                                                )}
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="break-words font-medium">{row.external_name}</div>
                                                <div className="text-xs text-gray-500">Цена: {row.supplier_price ?? "—"}</div>
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
                                            <td className="px-2 py-3 text-xs text-gray-700">
                                                {row.price_file_in_stock === true ? (
                                                    <span className="text-green-700">В файле: да</span>
                                                ) : row.price_file_in_stock === false ? (
                                                    <span className="text-amber-800">В файле: нет</span>
                                                ) : (
                                                    <span className="text-gray-400">В файле: —</span>
                                                )}
                                                {row.is_linked && row.catalog_supplier_channel_available != null ? (
                                                    <div className="mt-1 text-gray-600">
                                                        Витрина:{" "}
                                                        {row.catalog_supplier_channel_available ? (
                                                            <span className="text-green-700">да</span>
                                                        ) : (
                                                            <span className="text-amber-800">нет</span>
                                                        )}
                                                    </div>
                                                ) : null}
                                            </td>
                                            <td
                                                className="cursor-pointer px-3 py-3 text-xs whitespace-normal break-words"
                                                onClick={() => {
                                                    openManualLink(row);
                                                }}
                                            >
                                                {row.is_linked && row.linked_variant ? (
                                                    <div>
                                                        <div className="break-words font-medium">
                                                            {row.linked_variant.product_name}
                                                        </div>
                                                        {isExactProductNameMatch(
                                                            row.parsed?.product_name || "",
                                                            row.linked_variant.product_name || ""
                                                        ) ? (
                                                            <div className="mt-1 inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[11px] text-green-700">
                                                                Точное совпадение названия
                                                            </div>
                                                        ) : null}
                                                        <div className="break-words text-gray-500">
                                                            {row.linked_variant.display || "Вариант без параметров"}
                                                        </div>
                                                    </div>
                                                ) : row.suggested_variant ? (
                                                    <div>
                                                        <div className="break-words font-medium">
                                                            {row.suggested_variant.product_name}
                                                        </div>
                                                        {isExactProductNameMatch(
                                                            row.parsed?.product_name || "",
                                                            row.suggested_variant.product_name || ""
                                                        ) ? (
                                                            <div className="mt-1 inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[11px] text-green-700">
                                                                Точное совпадение названия
                                                            </div>
                                                        ) : null}
                                                        <div className="break-words text-gray-500">
                                                            {row.suggested_variant.display || "Вариант без параметров"}
                                                        </div>
                                                    </div>
                                                ) : row.suggested_product ? (
                                                    <div>
                                                        <div className="break-words font-medium">
                                                            {row.suggested_product.name}
                                                        </div>
                                                        <div className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
                                                            Совпал продукт, вариантов пока нет
                                                        </div>
                                                        <div className="mt-1 break-words text-gray-500">
                                                            {row.parsed?.volume
                                                                ? `${row.parsed.volume} ml`
                                                                : "—"}
                                                            {row.parsed?.concentration
                                                                ? ` / ${String(row.parsed.concentration).toUpperCase()}`
                                                                : ""}
                                                            {row.parsed?.is_tester ? " / TESTER" : ""}
                                                            {" · "}
                                                            <span className="text-gray-400">
                                                                {row.suggested_product.variants_count
                                                                    ? `есть ${row.suggested_product.variants_count} вар.`
                                                                    : "вариантов нет"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ) : row.linked_variant ? (
                                                    <div>
                                                        <div className="break-words font-medium">
                                                            {row.linked_variant.product_name}
                                                        </div>
                                                        <div className="break-words text-gray-500">
                                                            {row.linked_variant.display || "Вариант без параметров"}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    "Выбирете связь"
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <AdminPagination currentPage={meta?.current_page ?? 1} lastPage={meta?.last_page ?? 1} onPrevAction={() => setPage((p) => Math.max(1, p - 1))} onNextAction={() => setPage((p) => (meta && meta.current_page < meta.last_page ? p + 1 : p))} />
                    </div>
                ) : null}

                {!loading && items.length === 0 ? <div className="rounded-xl border px-4 py-5 text-sm text-gray-500">Нет данных. Загрузи прайс или измени фильтры.</div> : null}

                {manualLink ? (
                    <ManualLinkSearchHost
                        key={manualLink.rowId}
                        manualLink={manualLink}
                        setManualLink={setManualLink}
                        setSupplierError={setSupplierError}
                        loadManualVariants={loadManualVariants}
                        attachDefinitionFromDictionary={attachDefinitionFromDictionary}
                        linkingRowId={linkingRowId}
                        onConfirmAction={doForceLink}
                    />
                ) : null}

                <RulesModal
                    open={rulesOpen}
                    rules={rules}
                    rulePattern={rulePattern}
                    ruleReplacement={ruleReplacement}
                    ruleSaving={ruleSaving}
                    onCloseAction={() => setRulesOpen(false)}
                    onPatternChangeAction={setRulePattern}
                    onReplacementChangeAction={setRuleReplacement}
                    onCreateAction={saveRule}
                    onToggleRuleAction={toggleRule}
                    onDeleteRuleAction={removeRule}
                />
                <PricingSettingsModal
                    open={pricingOpen}
                    form={pricingForm}
                    saving={pricingSaving}
                    onCloseAction={() => setPricingOpen(false)}
                    onChangeAction={(field, value) => {
                        setPricingForm((prev) => ({ ...prev, [field]: Number.isFinite(value) ? value : 0 }));
                    }}
                    onSaveAction={savePricingSettings}
                />
            </div>
        </AdminPageCard>
    );
}

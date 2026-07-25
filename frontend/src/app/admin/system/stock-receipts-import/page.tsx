"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import {
    clearStockReceiptXlsImportReceiptTarget,
    closeStockReceiptXlsImport,
    commitStockReceiptXlsImport,
    fetchWarehouses,
    fetchWarehouseSuppliers,
    fetchStockReceiptXlsImportState,
    linkStockReceiptXlsImportRow,
    prepareStockReceiptXlsImport,
    resolveStockReceiptXlsImportBatch,
    saveStockReceiptXlsImportState,
    type StockReceiptImportDbState,
    type WarehouseOption,
    type WarehouseSupplierOption,
} from "@/lib/admin-warehouse-api";
import { createProductVariant, fetchProductVariants } from "@/lib/admin-product-variants-api";
import type { ProductAdminItem } from "@/lib/admin-products-api";
import {
    buildDefinitionSearchFromHint,
    canConfirmSuggestedLink,
    formatCatalogProductLabel,
    getVariantMatchFlags,
    isFullVariantMatch,
    variantMatchesVolumeHint,
} from "@/components/admin/import-export/seller-one/utils";
import {
    buildInitialMappingFromImportRows,
    buildInitialSearchFromImportRow,
    countImportRowsNeedingManualLink,
    importRowAsSellerOneView,
    mapKeyToRowId,
} from "@/components/admin/system/stock-receipts-import/utils";
import type {
    StockReceiptImportCatalogVariant,
    StockReceiptImportUnresolvedRow,
    StockReceiptManualLinkState,
} from "@/components/admin/system/stock-receipts-import/types";
import { StockReceiptManualLinkSearchHost } from "@/components/admin/system/stock-receipts-import/manual-link-search-host";
import { StockReceiptUnresolvedTable } from "@/components/admin/system/stock-receipts-import/unresolved-table";

const RESOLVE_BATCH_SIZE = 35;

function parseImportError(raw: string): { message: string; unresolved: StockReceiptImportUnresolvedRow[] } {
    try {
        const parsed = JSON.parse(raw) as { message?: string; unresolved?: StockReceiptImportUnresolvedRow[] };
        return {
            message: parsed.message || raw,
            unresolved: parsed.unresolved || [],
        };
    } catch {
        return { message: raw, unresolved: [] };
    }
}

export default function StockReceiptsImportSystemPage() {
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
    const [suppliers, setSuppliers] = useState<WarehouseSupplierOption[]>([]);
    const [warehouseId, setWarehouseId] = useState<number | "">("");
    const [supplierId, setSupplierId] = useState<number | "">("");
    const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 16));
    const [comment, setComment] = useState("Импорт прихода из XLS");
    const [loadingMeta, setLoadingMeta] = useState(false);
    const [loadingXls, setLoadingXls] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [unresolved, setUnresolved] = useState<StockReceiptImportUnresolvedRow[]>([]);
    const [mappingByKey, setMappingByKey] = useState<Record<string, string>>({});
    const [manualLink, setManualLink] = useState<StockReceiptManualLinkState | null>(null);
    const [importId, setImportId] = useState<string | null>(null);
    const [importProgress, setImportProgress] = useState("");
    const [parsedTotalRows, setParsedTotalRows] = useState<number | null>(null);
    const [linkedDraftReceiptId, setLinkedDraftReceiptId] = useState<number | null>(null);
    const [inReceiptCount, setInReceiptCount] = useState(0);
    const didHydrateFromServerRef = useRef(false);

    const applyImportState = (saved: StockReceiptImportDbState) => {
        setImportId(saved.import_id);
        setUnresolved(Array.isArray(saved.rows) ? (saved.rows as StockReceiptImportUnresolvedRow[]) : []);
        setMappingByKey(saved.mapping_by_key && typeof saved.mapping_by_key === "object" ? saved.mapping_by_key : {});
        setParsedTotalRows(typeof saved.total_rows === "number" ? saved.total_rows : null);
        setLinkedDraftReceiptId(
            typeof saved.target_stock_receipt_id === "number" ? saved.target_stock_receipt_id : null,
        );
        setInReceiptCount(typeof saved.in_receipt === "number" ? saved.in_receipt : 0);
        setWarehouseId(typeof saved.warehouse_id === "number" ? saved.warehouse_id : "");
        setSupplierId(typeof saved.supplier_id === "number" ? saved.supplier_id : "");
        if (typeof saved.received_at === "string" && saved.received_at) {
            setReceivedAt(saved.received_at);
        }
        if (typeof saved.comment === "string") {
            setComment(saved.comment);
        }
    };

    useEffect(() => {
        const run = async () => {
            try {
                const res = await fetchStockReceiptXlsImportState();
                const saved = res.data;
                if (!saved) {
                    didHydrateFromServerRef.current = true;
                    return;
                }

                applyImportState(saved);
                setSuccess(
                    saved.in_receipt > 0
                        ? `Открыт общий импорт: в приходе ${saved.in_receipt} из ${saved.total_rows} строк.`
                        : "Открыт общий импорт XLS из БД.",
                );
            } catch (e) {
                setError(e instanceof Error ? e.message : "Не удалось восстановить импорт");
            } finally {
                didHydrateFromServerRef.current = true;
            }
        };
        void run();
    }, []);

    useEffect(() => {
        if (!didHydrateFromServerRef.current || !importId) {
            return;
        }

        const timer = window.setTimeout(() => {
            void saveStockReceiptXlsImportState({
                import_id: importId,
                warehouse_id: typeof warehouseId === "number" ? warehouseId : null,
                supplier_id: typeof supplierId === "number" ? supplierId : null,
                received_at: receivedAt,
                comment,
            });
        }, 400);

        return () => window.clearTimeout(timer);
    }, [importId, warehouseId, supplierId, receivedAt, comment]);

    const ensureMeta = async () => {
        setLoadingMeta(true);
        try {
            const [w, s] = await Promise.all([fetchWarehouses(), fetchWarehouseSuppliers()]);
            setWarehouses(w.data || []);
            setSuppliers(s.data || []);
            if ((w.data || []).length > 0 && warehouseId === "") {
                setWarehouseId(w.data[0].id);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось загрузить справочники");
        } finally {
            setLoadingMeta(false);
        }
    };

    useEffect(() => {
        if (warehouses.length > 0 && suppliers.length > 0) {
            return;
        }
        void ensureMeta();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const applyRowLink = async (mapKey: string, linkedVariant: StockReceiptImportCatalogVariant | null) => {
        setMappingByKey((prev) => {
            const next = { ...prev };
            if (linkedVariant?.id) {
                next[mapKey] = String(linkedVariant.id);
            } else {
                delete next[mapKey];
            }
            return next;
        });
        setUnresolved((prev) =>
            prev.map((row) =>
                row.map_key === mapKey ? { ...row, linked_variant: linkedVariant } : row,
            ),
        );

        if (importId && linkedVariant?.id) {
            try {
                await linkStockReceiptXlsImportRow({
                    import_id: importId,
                    map_key: mapKey,
                    variant_id: linkedVariant.id,
                });
            } catch (e) {
                setError(e instanceof Error ? e.message : "Не удалось сохранить связку в БД");
            }
        }
    };

    const buildMappingPayload = () =>
        Object.entries(mappingByKey)
            .filter(([, variantId]) => Number(variantId) > 0)
            .map(([mapKey, variantId]) => ({ map_key: mapKey, variant_id: Number(variantId) }));

    const buildCommitPayloadBase = () => {
        const supplier = suppliers.find((item) => item.id === supplierId) ?? null;
        return {
            warehouse_id: typeof warehouseId === "number" ? warehouseId : null,
            supplier_id: typeof supplierId === "number" ? supplierId : null,
            supplier_code: supplier?.code ?? null,
            supplier_name: supplier?.name ?? "XLS import",
            received_at: receivedAt || null,
            comment: comment.trim(),
        };
    };

    const handleLoadXls = async () => {
        setError("");
        setSuccess("");
        setImportProgress("");
        if (!file) {
            setError("Выберите XLS/XLSX файл");
            return;
        }

        setLoadingXls(true);
        try {
            const prep = await prepareStockReceiptXlsImport(file);
            const nextImportId = prep.import_id;
            setImportId(nextImportId);
            setParsedTotalRows(prep.total_rows);

            if (prep.reused) {
                setSuccess("Открыт существующий импорт этого файла (общий для всех админов).");
            }

            const byKey = new Map<string, StockReceiptImportUnresolvedRow>();

            if (!prep.reused) {
                let guard = 0;
                while (guard < 10_000) {
                    guard += 1;
                    setImportProgress(`Разбор строк…`);
                    const batch = await resolveStockReceiptXlsImportBatch({
                        import_id: nextImportId,
                        limit: RESOLVE_BATCH_SIZE,
                    });
                    for (const row of batch.unresolved as StockReceiptImportUnresolvedRow[]) {
                        byKey.set(row.map_key, row);
                    }
                    setImportProgress(
                        `Разбор строк ${batch.next_offset} / ${batch.total_rows}…`,
                    );
                    if (batch.done) {
                        break;
                    }
                }
            } else {
                const stateRes = await fetchStockReceiptXlsImportState();
                if (stateRes.data && stateRes.data.import_id === nextImportId) {
                    applyImportState(stateRes.data);
                    setImportProgress("");
                    return;
                }
                let guard = 0;
                while (guard < 10_000) {
                    guard += 1;
                    const batch = await resolveStockReceiptXlsImportBatch({
                        import_id: nextImportId,
                        limit: RESOLVE_BATCH_SIZE,
                    });
                    for (const row of batch.unresolved as StockReceiptImportUnresolvedRow[]) {
                        byKey.set(row.map_key, row);
                    }
                    if (batch.done || (batch.pending_resolve ?? 0) === 0) {
                        break;
                    }
                }
            }

            setImportProgress("");

            const stateAfter = await fetchStockReceiptXlsImportState();
            if (stateAfter.data && stateAfter.data.import_id === nextImportId) {
                applyImportState(stateAfter.data);
            } else {
                const mergedUnresolved = Array.from(byKey.values());
                const initialMapping = buildInitialMappingFromImportRows(mergedUnresolved);
                setUnresolved(mergedUnresolved);
                setMappingByKey(initialMapping);
            }

            const rows = stateAfter.data?.rows as StockReceiptImportUnresolvedRow[] | undefined;
            const mergedUnresolved = rows ?? Array.from(byKey.values());
            const initialMapping = buildInitialMappingFromImportRows(
                mergedUnresolved.filter((r) => !r.in_receipt && r.receipt_status !== "in_receipt"),
            );
            const autoLinkedCount = Object.keys(initialMapping).length;
            const manualCount = countImportRowsNeedingManualLink(
                mergedUnresolved.filter((r) => !r.in_receipt && r.receipt_status !== "in_receipt"),
                { ...initialMapping, ...(stateAfter.data?.mapping_by_key ?? {}) },
            );

            if (prep.reused) {
                setSuccess(
                    `Открыт существующий импорт (${prep.total_rows} строк). В приходе: ${stateAfter.data?.in_receipt ?? 0}.`,
                );
            } else if (manualCount === 0) {
                setSuccess(
                    `Разбор завершён: ${autoLinkedCount} автосвязок. Проверьте таблицу и нажмите «Создать приход».`,
                );
            } else {
                setSuccess(
                    `Разбор завершён: ${autoLinkedCount} автосвязок, ${manualCount} строк требуют ручной связки.`,
                );
            }
        } catch (e) {
            const parsed = parseImportError(e instanceof Error ? e.message : "Ошибка импорта");
            setError(parsed.message);
            setUnresolved(parsed.unresolved);
            setMappingByKey({});
        } finally {
            setLoadingXls(false);
            setImportProgress("");
        }
    };

    const handleCommitReceipt = async () => {
        if (!importId) {
            setError("Сначала загрузите XLS");
            return;
        }

        const mappingPayload = buildMappingPayload().filter((item) => {
            const row = unresolved.find((r) => r.map_key === item.map_key);
            return !(row?.in_receipt || row?.receipt_status === "in_receipt");
        });
        const pendingRows = unresolved.filter((r) => !r.in_receipt && r.receipt_status !== "in_receipt");
        if (pendingRows.length > 0 && mappingPayload.length === 0) {
            setError("Отметьте связку хотя бы для одной новой строки (ещё не в приходе).");
            return;
        }

        setCommitting(true);
        setError("");
        try {
            const response = await commitStockReceiptXlsImport({
                import_id: importId,
                ...buildCommitPayloadBase(),
                mapping: mappingPayload,
            });

            const keys = new Set(response.committed_map_keys || []);
            setUnresolved((prev) =>
                prev.map((row) =>
                    keys.has(row.map_key)
                        ? {
                            ...row,
                            in_receipt: true,
                            receipt_status: "in_receipt",
                            stock_receipt_id: response.data.id,
                        }
                        : row,
                ),
            );
            setInReceiptCount((prev) => prev + (response.committed_rows_count || 0));
            setLinkedDraftReceiptId(response.data.id);
            const doc = response.data.document_no ?? String(response.data.id);
            setSuccess(
                response.created_new_receipt
                    ? `Создан черновик прихода №${doc}. Добавлено строк: ${response.committed_rows_count}.`
                    : `В приход №${doc} добавлено строк: ${response.committed_rows_count}.`,
            );
        } catch (e) {
            const parsed = parseImportError(e instanceof Error ? e.message : "Ошибка сохранения");
            setError(parsed.message);
            if (parsed.unresolved.length > 0) {
                setUnresolved((prev) => {
                    const byKey = new Map(prev.map((r) => [r.map_key, r]));
                    parsed.unresolved.forEach((row) => byKey.set(row.map_key, row));
                    return Array.from(byKey.values());
                });
            }
        } finally {
            setCommitting(false);
        }
    };

    const handleClearReceiptBinding = async () => {
        if (!importId) {
            return;
        }
        setError("");
        try {
            await clearStockReceiptXlsImportReceiptTarget(importId);
            setLinkedDraftReceiptId(null);
            setSuccess("Привязка к документу сброшена: следующее сохранение создаст новый черновик прихода.");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось сбросить привязку");
        }
    };

    const handleCloseImport = async () => {
        if (!importId) {
            return;
        }
        setError("");
        try {
            await closeStockReceiptXlsImport(importId);
            setImportId(null);
            setUnresolved([]);
            setMappingByKey({});
            setParsedTotalRows(null);
            setLinkedDraftReceiptId(null);
            setInReceiptCount(0);
            setSuccess("Импорт закрыт.");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось закрыть импорт");
        }
    };

    const handleToggleLink = (row: StockReceiptImportUnresolvedRow, checked: boolean) => {
        if (row.in_receipt || row.receipt_status === "in_receipt") {
            return;
        }
        const sellerOneRow = importRowAsSellerOneView(row, mappingByKey);

        if (checked) {
            if (!canConfirmSuggestedLink(sellerOneRow)) {
                setError(
                    row.suggested_variant?.id
                        ? "Автосвязка доступна только при 100% и точном совпадении имени. Выберите связь вручную."
                        : "Нет автокандидата для связывания",
                );
                return;
            }
            void applyRowLink(row.map_key, row.suggested_variant!);
            return;
        }

        void applyRowLink(row.map_key, null);
    };

    const openManualLink = (row: StockReceiptImportUnresolvedRow) => {
        if (row.in_receipt || row.receipt_status === "in_receipt") {
            return;
        }
        const initialSearch = buildInitialSearchFromImportRow(row);
        const parsed = row.parsed;
        const sourceHint = {
            brand: parsed?.brand?.trim() || "",
            productName: parsed?.product_name?.trim() || row.title || "",
            volume: parsed?.volume ?? null,
            volumeIsMultipack: Boolean(parsed?.volume_is_multipack),
            volumeMultipackCount: parsed?.volume_multipack_count ?? null,
            volumeMultipackUnitMl: parsed?.volume_multipack_unit_ml ?? null,
            concentration: parsed?.concentration ?? null,
            isTester: Boolean(parsed?.is_tester),
            isVial: Boolean(parsed?.is_vial),
            isMiniature: Boolean(parsed?.is_miniature),
        };
        setManualLink({
            mapKey: row.map_key,
            rowId: mapKeyToRowId(row.map_key),
            rowName: row.title || row.code || row.map_key,
            linkSearchBrandId: row.parsed?.brand_id ?? null,
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
            setError(e instanceof Error ? e.message : "Ошибка загрузки вариантов");
        }
    };

    const pickProduct = async (product: ProductAdminItem) => {
        await loadManualVariants(product.id, undefined, product);
    };

    const pickManualVariant = (variantId: number) => {
        setManualLink((prev) => (prev ? { ...prev, selectedVariantId: variantId } : prev));
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
            setError(e instanceof Error ? e.message : "Ошибка добавления варианта из справочника");
        } finally {
            setManualLink((prev) => (prev ? { ...prev, attachingDefinition: false } : prev));
        }
    };

    const pendingLinkedCount = unresolved.filter(
        (row) =>
            !(row.in_receipt || row.receipt_status === "in_receipt")
            && Boolean(mappingByKey[row.map_key]),
    ).length;

    const canCommit = Boolean(importId) && pendingLinkedCount > 0;

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Система: импорт приходов XLS"
                description="Файл хранится в БД как общий импорт. Два админа могут работать параллельно: строки «В приходе» заблокированы. Связывайте оставшиеся и нажимайте «Создать/Добавить в приход». Проведите документ на странице приходов."
            />

            {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}
            {success ? <AdminFeedbackMessage type="success" message={success} onCloseAction={() => setSuccess("")} /> : null}

            <div className="space-y-3 rounded-2xl border p-4">
                <button
                    type="button"
                    onClick={() => void ensureMeta()}
                    disabled={loadingMeta}
                    className="rounded-lg border px-3 py-2 text-sm"
                >
                    {loadingMeta ? "Загрузка..." : "Загрузить справочники"}
                </button>
                <input
                    type="file"
                    accept=".xls,.xlsx"
                    onChange={(e) => {
                        setFile(e.target.files?.[0] ?? null);
                    }}
                    className="block w-full rounded-lg border px-3 py-2 text-sm"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                    <select
                        value={warehouseId}
                        onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : "")}
                        className="rounded-lg border px-3 py-2 text-sm"
                    >
                        <option value="">Склад</option>
                        {warehouses.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.name}
                            </option>
                        ))}
                    </select>
                    <select
                        value={supplierId}
                        onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
                        className="rounded-lg border px-3 py-2 text-sm"
                    >
                        <option value="">Поставщик</option>
                        {suppliers.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.name}
                            </option>
                        ))}
                    </select>
                </div>
                <input
                    type="datetime-local"
                    value={receivedAt}
                    onChange={(e) => setReceivedAt(e.target.value)}
                    className="rounded-lg border px-3 py-2 text-sm"
                />
                <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="rounded-lg border px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => void handleLoadXls()}
                        disabled={loadingXls || committing}
                        className="rounded-lg bg-admin-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                        {loadingXls ? importProgress || "Разбор XLS…" : "Загрузить XLS"}
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleCommitReceipt()}
                        disabled={!canCommit || committing || loadingXls}
                        className="rounded-lg border border-black bg-white px-4 py-2 text-sm font-medium disabled:opacity-60"
                    >
                        {committing ? "Сохранение…" : linkedDraftReceiptId ? "Добавить в приход" : "Создать приход"}
                    </button>
                    {importId ? (
                        <button
                            type="button"
                            onClick={() => void handleClearReceiptBinding()}
                            disabled={committing || loadingXls}
                            className="rounded-lg border px-4 py-2 text-sm text-admin-text disabled:opacity-60"
                        >
                            Новый документ (сброс привязки)
                        </button>
                    ) : null}
                    {importId ? (
                        <button
                            type="button"
                            onClick={() => void handleCloseImport()}
                            disabled={committing || loadingXls}
                            className="rounded-lg border px-4 py-2 text-sm text-admin-text disabled:opacity-60"
                        >
                            Закрыть импорт
                        </button>
                    ) : null}
                </div>
                {importId ? (
                    <p className="text-xs text-admin-text-secondary">
                        Импорт: <span className="font-mono">{importId}</span>
                        {parsedTotalRows != null ? ` · строк: ${parsedTotalRows}` : null}
                        {inReceiptCount > 0 ? ` · в приходе: ${inReceiptCount}` : null}
                        {linkedDraftReceiptId ? (
                            <>
                                {" · "}
                                <Link
                                    className="text-blue-700 underline"
                                    href={`/admin/warehouse/receipts/${linkedDraftReceiptId}/edit`}
                                >
                                    Черновик прихода №{linkedDraftReceiptId}
                                </Link>
                            </>
                        ) : null}
                    </p>
                ) : null}
            </div>

            {unresolved.length > 0 ? (
                <StockReceiptUnresolvedTable
                    rows={unresolved}
                    mappingByKey={mappingByKey}
                    onToggleLinkAction={handleToggleLink}
                    onOpenManualLinkAction={openManualLink}
                />
            ) : null}

            {manualLink ? (
                <StockReceiptManualLinkSearchHost
                    manualLink={manualLink}
                    setManualLink={setManualLink}
                    setError={setError}
                    pickProduct={pickProduct}
                    attachDefinitionFromDictionary={attachDefinitionFromDictionary}
                    onPickVariantAction={pickManualVariant}
                    onConfirmAction={(mapKey, variantId, linkedVariant) => {
                        void applyRowLink(mapKey, linkedVariant);
                        setSuccess(`Связка сохранена для строки ${mapKey}`);
                    }}
                />
            ) : null}
        </AdminPageCard>
    );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import {
    clearStockReceiptXlsImportReceiptTarget,
    commitStockReceiptXlsImport,
    fetchWarehouses,
    fetchWarehouseSuppliers,
    fetchStockReceiptXlsImportState,
    prepareStockReceiptXlsImport,
    resolveStockReceiptXlsImportBatch,
    saveStockReceiptXlsImportState,
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
    const [importSessionId, setImportSessionId] = useState<string | null>(null);
    const [importProgress, setImportProgress] = useState("");
    const [parsedTotalRows, setParsedTotalRows] = useState<number | null>(null);
    const [linkedDraftReceiptId, setLinkedDraftReceiptId] = useState<number | null>(null);
    const didHydrateFromServerRef = useRef(false);

    useEffect(() => {
        const run = async () => {
            try {
                const res = await fetchStockReceiptXlsImportState();
                const saved = res.data;
                if (!saved) {
                    didHydrateFromServerRef.current = true;
                    return;
                }

                setImportSessionId(saved.session_id ?? null);
                setUnresolved(Array.isArray(saved.unresolved) ? (saved.unresolved as StockReceiptImportUnresolvedRow[]) : []);
                setMappingByKey(saved.mapping_by_key && typeof saved.mapping_by_key === "object" ? saved.mapping_by_key : {});
                setParsedTotalRows(typeof saved.parsed_total_rows === "number" ? saved.parsed_total_rows : null);
                setLinkedDraftReceiptId(typeof saved.linked_draft_receipt_id === "number" ? saved.linked_draft_receipt_id : null);
                setWarehouseId(typeof saved.warehouse_id === "number" ? saved.warehouse_id : "");
                setSupplierId(typeof saved.supplier_id === "number" ? saved.supplier_id : "");
                setReceivedAt(typeof saved.received_at === "string" ? saved.received_at : new Date().toISOString().slice(0, 16));
                setComment(typeof saved.comment === "string" ? saved.comment : "Импорт прихода из XLS");
                setSuccess("Восстановлена сессия импорта XLS из БД.");
            } catch (e) {
                setError(e instanceof Error ? e.message : "Не удалось восстановить состояние импорта");
            } finally {
                didHydrateFromServerRef.current = true;
            }
        };
        void run();
    }, []);

    useEffect(() => {
        if (!didHydrateFromServerRef.current) {
            return;
        }

        const timer = window.setTimeout(() => {
            void saveStockReceiptXlsImportState({
                session_id: importSessionId,
                unresolved,
                mapping_by_key: mappingByKey,
                parsed_total_rows: parsedTotalRows,
                linked_draft_receipt_id: linkedDraftReceiptId,
                warehouse_id: typeof warehouseId === "number" ? warehouseId : null,
                supplier_id: typeof supplierId === "number" ? supplierId : null,
                received_at: receivedAt,
                comment,
            });
        }, 300);

        return () => window.clearTimeout(timer);
    }, [
        importSessionId,
        unresolved,
        mappingByKey,
        parsedTotalRows,
        linkedDraftReceiptId,
        warehouseId,
        supplierId,
        receivedAt,
        comment,
    ]);

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

    const applyRowLink = (mapKey: string, linkedVariant: StockReceiptImportCatalogVariant | null) => {
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
            const sessionId = prep.session_id;
            setImportSessionId(sessionId);
            setLinkedDraftReceiptId(null);
            setParsedTotalRows(prep.total_rows);

            let offset = 0;
            const byKey = new Map<string, StockReceiptImportUnresolvedRow>();

            while (offset < prep.total_rows) {
                const hi = Math.min(offset + RESOLVE_BATCH_SIZE, prep.total_rows);
                setImportProgress(`Разбор строк ${hi} / ${prep.total_rows}…`);
                const batch = await resolveStockReceiptXlsImportBatch({
                    session_id: sessionId,
                    offset,
                    limit: RESOLVE_BATCH_SIZE,
                });
                for (const row of batch.unresolved as StockReceiptImportUnresolvedRow[]) {
                    byKey.set(row.map_key, row);
                }
                offset = batch.next_offset;
                if (batch.done) {
                    break;
                }
            }

            setImportProgress("");

            const mergedUnresolved = Array.from(byKey.values());
            const initialMapping = buildInitialMappingFromImportRows(mergedUnresolved);
            setUnresolved(mergedUnresolved);
            setMappingByKey(initialMapping);

            const autoLinkedCount = Object.keys(initialMapping).length;
            const manualCount = countImportRowsNeedingManualLink(mergedUnresolved, initialMapping);

            if (mergedUnresolved.length === 0) {
                setSuccess(
                    `Разбор завершён (${prep.total_rows} строк). Нажмите «Создать приход», чтобы создать черновик документа.`,
                );
            } else if (manualCount === 0) {
                setSuccess(
                    `Разбор завершён: ${autoLinkedCount} из ${prep.total_rows} строк с галочкой «Связка» (100%). Проверьте таблицу и нажмите «Создать приход».`,
                );
            } else {
                setSuccess(
                    `Разбор завершён: ${autoLinkedCount} автосвязок (галочки), ${manualCount} строк требуют ручной связки.`,
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
        if (!importSessionId) {
            setError("Сначала загрузите XLS");
            return;
        }

        const mappingPayload = buildMappingPayload();
        if (unresolved.length > 0 && mappingPayload.length === 0) {
            setError("Отметьте связку хотя бы для одной строки (чекбокс или ручной поиск) или дождитесь автосопоставления.");
            return;
        }

        setCommitting(true);
        setError("");
        try {
            const response = await commitStockReceiptXlsImport({
                session_id: importSessionId,
                ...buildCommitPayloadBase(),
                mapping: mappingPayload,
            });

            const keys = new Set(response.committed_map_keys || []);
            setUnresolved((prev) => prev.filter((row) => !keys.has(row.map_key)));
            setMappingByKey((prev) => {
                const next = { ...prev };
                (response.committed_map_keys || []).forEach((k) => {
                    delete next[k];
                });
                return next;
            });

            setLinkedDraftReceiptId(response.data.id);
            const doc = response.data.document_no ?? String(response.data.id);
            setSuccess(
                response.created_new_receipt
                    ? `Создан черновик прихода №${doc}. Добавлено строк: ${response.committed_rows_count}. Проведите документ на странице приходов, когда будете готовы.`
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
        if (!importSessionId) {
            return;
        }
        setError("");
        try {
            await clearStockReceiptXlsImportReceiptTarget(importSessionId);
            setLinkedDraftReceiptId(null);
            setSuccess("Привязка к документу сброшена: следующее сохранение создаст новый черновик прихода.");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось сбросить привязку");
        }
    };

    const handleToggleLink = (row: StockReceiptImportUnresolvedRow, checked: boolean) => {
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
            applyRowLink(row.map_key, row.suggested_variant!);
            return;
        }

        applyRowLink(row.map_key, null);
    };

    const openManualLink = (row: StockReceiptImportUnresolvedRow) => {
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

    const canCommit =
        Boolean(importSessionId) &&
        (unresolved.length === 0 || buildMappingPayload().length > 0);

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Система: импорт приходов XLS"
                description="Сначала загрузите файл — таблица остаётся на экране. Связывайте строки и периодически нажимайте «Создать приход» / «Добавить в приход»: позиции попадают в один черновик, пока вы не сбросите привязку. Проведите документ на странице приходов, чтобы оприходовать товар на склад."
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
                        setImportSessionId(null);
                        setUnresolved([]);
                        setMappingByKey({});
                        setParsedTotalRows(null);
                        setLinkedDraftReceiptId(null);
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
                    {importSessionId ? (
                        <button
                            type="button"
                            onClick={() => void handleClearReceiptBinding()}
                            disabled={committing || loadingXls}
                            className="rounded-lg border px-4 py-2 text-sm text-admin-text disabled:opacity-60"
                        >
                            Новый документ (сброс привязки)
                        </button>
                    ) : null}
                </div>
                {importSessionId ? (
                    <p className="text-xs text-admin-text-secondary">
                        Сессия: <span className="font-mono">{importSessionId}</span>
                        {parsedTotalRows != null ? ` · строк в файле: ${parsedTotalRows}` : null}
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
                        applyRowLink(mapKey, linkedVariant);
                        setSuccess(`Связка сохранена для строки ${mapKey}`);
                    }}
                />
            ) : null}
        </AdminPageCard>
    );
}

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
import { buildInitialSearchFromImportRow } from "@/components/admin/system/stock-receipts-import/utils";
import type {
    StockReceiptImportUnresolvedRow,
    StockReceiptManualLinkState,
} from "@/components/admin/system/stock-receipts-import/types";
import { StockReceiptManualLinkSearchHost } from "@/components/admin/system/stock-receipts-import/manual-link-search-host";

const RESOLVE_BATCH_SIZE = 75;

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
            setUnresolved(mergedUnresolved);
            setMappingByKey((prev) => {
                const next = { ...prev };
                mergedUnresolved.forEach((row) => {
                    if (!next[row.map_key] && row.suggested_variant?.id) {
                        next[row.map_key] = String(row.suggested_variant.id);
                    }
                });
                return next;
            });

            if (mergedUnresolved.length === 0) {
                setSuccess(
                    `Разбор завершён (${prep.total_rows} строк). Все позиции сопоставлены автоматически. Нажмите «Создать приход», чтобы создать черновик документа.`,
                );
            } else {
                setSuccess(
                    `Разбор завершён: ${mergedUnresolved.length} из ${prep.total_rows} строк требуют ручной связки. Таблица остаётся на экране; после связок нажимайте «Добавить в приход».`,
                );
            }
        } catch (e) {
            const parsed = parseImportError(e instanceof Error ? e.message : "Ошибка импорта");
            setError(parsed.message);
            setUnresolved(parsed.unresolved);
            setMappingByKey((prev) => {
                const next = { ...prev };
                parsed.unresolved.forEach((row) => {
                    if (!next[row.map_key] && row.suggested_variant?.id) {
                        next[row.map_key] = String(row.suggested_variant.id);
                    }
                });
                return next;
            });
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
            setError("Укажите variant_id хотя бы для одной строки таблицы или дождитесь автосопоставления.");
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

    const openManualLink = (row: StockReceiptImportUnresolvedRow) => {
        const initialSearch = buildInitialSearchFromImportRow(row);
        const parsed = row.parsed;
        setManualLink({
            mapKey: row.map_key,
            rowTitle: row.title || row.code || row.map_key,
            pendingPreferVariantId: row.suggested_variant?.id ?? null,
            productSearch: initialSearch,
            sourceHint: {
                brand: parsed?.brand?.trim() || "",
                productName: parsed?.product_name?.trim() || row.title || "",
                volume: parsed?.volume ?? null,
                concentration: parsed?.concentration ?? null,
                isTester: Boolean(parsed?.is_tester),
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

    const loadManualVariants = async (productId: number, explicitPreferVariantId?: number) => {
        let preferVariantId: number | undefined;
        setManualLink((prev) => {
            if (!prev) {
                return prev;
            }
            preferVariantId = explicitPreferVariantId ?? prev.pendingPreferVariantId ?? undefined;
            return {
                ...prev,
                selectedProductId: productId,
                variants: [],
                selectedVariantId: null,
                variantsLoading: true,
                definitions: [],
                definitionSearch: "",
                definitionsLoading: false,
                pendingPreferVariantId: null,
            };
        });
        try {
            const data = await fetchProductVariants(productId);
            const variants = data.data || [];
            setManualLink((prev) => {
                if (!prev) {
                    return prev;
                }

                const rowTitle = (prev.rowTitle || "").toLowerCase();
                const parsedVolumeFromTitle = (() => {
                    const m = rowTitle.match(/(\d+(?:[.,]\d+)?)\s*(ml|мл)\b/i);
                    if (!m?.[1]) return null;
                    const n = Number(String(m[1]).replace(",", "."));
                    return Number.isFinite(n) ? n : null;
                })();
                const hintVolume = prev.sourceHint.volume ?? parsedVolumeFromTitle;

                const normalizeConcentration = (value: string): string => {
                    const v = value.trim().toLowerCase();
                    if (v === "") return "";
                    if (v.includes("туалет")) return "edt";
                    if (v.includes("парфюмер") || v.includes("eau de parfum")) return "edp";
                    if (v.includes("одекол")) return "edc";
                    if (v.includes("духи") || v.includes("parfum") || v.includes("extrait")) return "parfum";
                    if (v.includes("edt")) return "edt";
                    if (v.includes("edp")) return "edp";
                    if (v.includes("edc")) return "edc";
                    return v;
                };

                const concentrationFromTitle = (() => {
                    if (/\bedt\b/i.test(rowTitle)) return "edt";
                    if (/\bedp\b/i.test(rowTitle)) return "edp";
                    if (/\bedc\b/i.test(rowTitle)) return "edc";
                    if (/\b(parfum|extrait)\b/i.test(rowTitle)) return "parfum";
                    return "";
                })();

                const normalizedHintConcentration = normalizeConcentration(
                    prev.sourceHint.concentration || concentrationFromTitle
                );
                const hintIsTester = prev.sourceHint.isTester || /\b(test|tester|тестер)\b/i.test(rowTitle);

                let bestVariantId: number | null = null;
                let bestScore = Number.NEGATIVE_INFINITY;

                for (const variant of variants) {
                    let score = 0;
                    const variantVolume = variant.volume != null ? Number(variant.volume) : null;
                    const variantConcentration = normalizeConcentration(
                        `${variant.concentration || ""} ${variant.type || ""} ${variant.title || ""}`
                    );
                    const variantIsTester =
                        variant.definition?.is_tester === true ||
                        /(?:^|\s)(test|tester|тестер)(?:\s|$)/i.test(variant.title || "");

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

                    // Для строк с "test/tester/тестер" приоритетно выбираем тестерный вариант.
                    if (hintIsTester) {
                        score += variantIsTester ? 80 : -120;
                    } else if (variantIsTester) {
                        score -= 10;
                    }

                    if (score > bestScore) {
                        bestScore = score;
                        bestVariantId = variant.id;
                    }
                }

                const preferred =
                    preferVariantId && variants.some((v) => v.id === preferVariantId)
                        ? preferVariantId
                        : bestVariantId ?? (variants.length === 1 ? variants[0].id : null);

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
                    className="rounded-xl border px-3 py-2 text-sm"
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
                    className="block w-full rounded-xl border px-3 py-2 text-sm"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                    <select
                        value={warehouseId}
                        onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : "")}
                        className="rounded-xl border px-3 py-2 text-sm"
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
                        className="rounded-xl border px-3 py-2 text-sm"
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
                    className="rounded-xl border px-3 py-2 text-sm"
                />
                <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="rounded-xl border px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => void handleLoadXls()}
                        disabled={loadingXls || committing}
                        className="rounded-full bg-admin-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                        {loadingXls ? importProgress || "Разбор XLS…" : "Загрузить XLS"}
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleCommitReceipt()}
                        disabled={!canCommit || committing || loadingXls}
                        className="rounded-xl border border-black bg-white px-4 py-2 text-sm font-medium disabled:opacity-60"
                    >
                        {committing ? "Сохранение…" : linkedDraftReceiptId ? "Добавить в приход" : "Создать приход"}
                    </button>
                    {importSessionId ? (
                        <button
                            type="button"
                            onClick={() => void handleClearReceiptBinding()}
                            disabled={committing || loadingXls}
                            className="rounded-xl border px-4 py-2 text-sm text-admin-text disabled:opacity-60"
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
                <div className="mt-4 overflow-x-auto rounded-xl border">
                    <table className="min-w-full text-xs">
                        <thead className="bg-admin-muted text-left text-admin-text-secondary">
                            <tr>
                                <th className="px-3 py-2">Код</th>
                                <th className="px-3 py-2">Название</th>
                                <th className="px-3 py-2">Qty</th>
                                <th className="px-3 py-2">Авто</th>
                                <th className="px-3 py-2">Связка</th>
                            </tr>
                        </thead>
                        <tbody>
                            {unresolved.map((row) => (
                                <tr key={row.map_key} className="border-t">
                                    <td className="px-3 py-2">{row.code || "—"}</td>
                                    <td className="px-3 py-2">{row.title || "—"}</td>
                                    <td className="px-3 py-2">{row.qty ?? 0}</td>
                                    <td className="px-3 py-2">{row.suggested_variant?.id ? `#${row.suggested_variant.id}` : "—"}</td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <input
                                                value={mappingByKey[row.map_key] ?? ""}
                                                onChange={(e) =>
                                                    setMappingByKey((prev) => ({ ...prev, [row.map_key]: e.target.value }))
                                                }
                                                className="w-24 rounded border px-2 py-1"
                                                placeholder="variant_id"
                                            />
                                            <button type="button" onClick={() => openManualLink(row)} className="rounded border px-2 py-1">
                                                Поиск товара и варианта
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : importSessionId && parsedTotalRows != null && parsedTotalRows > 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-admin-text-secondary">
                    Все строки этого файла сопоставлены автоматически (или уже добавлены в приход). Нажмите «Создать приход», чтобы
                    записать их в черновик документа.
                </div>
            ) : null}

            {manualLink ? (
                <StockReceiptManualLinkSearchHost
                    manualLink={manualLink}
                    setManualLink={setManualLink}
                    setError={setError}
                    loadManualVariants={loadManualVariants}
                    attachDefinitionFromDictionary={attachDefinitionFromDictionary}
                    onConfirmVariant={(mapKey, variantId) => {
                        setMappingByKey((prev) => ({ ...prev, [mapKey]: String(variantId) }));
                    }}
                />
            ) : null}
        </AdminPageCard>
    );
}

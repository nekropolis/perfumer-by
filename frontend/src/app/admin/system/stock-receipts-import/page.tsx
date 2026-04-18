"use client";

import { useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminTableToolbar from "@/components/admin/ui/admin-table-toolbar";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import {
    fetchWarehouses,
    fetchWarehouseSuppliers,
    importStockReceiptXls,
    type WarehouseOption,
    type WarehouseSupplierOption,
} from "@/lib/admin-warehouse-api";
import { fetchProducts, type ProductAdminItem } from "@/lib/admin-products-api";
import { fetchProductVariants, type AdminProductVariantItem } from "@/lib/admin-product-variants-api";
import { formatVariantOptionLabel } from "@/components/admin/import-export/seller-one/utils";

type ImportUnresolvedRow = {
    map_key: string;
    code?: string;
    title?: string;
    qty?: number;
    suggested_variant?: {
        id?: number;
        product_name?: string;
        display?: string;
    } | null;
    parsed?: {
        brand?: string;
        product_name?: string;
    } | null;
};

type ManualLinkState = {
    row: ImportUnresolvedRow;
    productSearch: string;
    products: ProductAdminItem[];
    productsLoading: boolean;
    selectedProductId: number | null;
    variants: AdminProductVariantItem[];
    variantsLoading: boolean;
    selectedVariantId: number | null;
};

function parseImportError(raw: string): { message: string; unresolved: ImportUnresolvedRow[] } {
    try {
        const parsed = JSON.parse(raw) as { message?: string; unresolved?: ImportUnresolvedRow[] };
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
    const [submitting, setSubmitting] = useState(false);
    const [unresolved, setUnresolved] = useState<ImportUnresolvedRow[]>([]);
    const [mappingByKey, setMappingByKey] = useState<Record<string, string>>({});
    const [manualLink, setManualLink] = useState<ManualLinkState | null>(null);

    const ensureMeta = async () => {
        if (warehouses.length > 0 || suppliers.length > 0) return;
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

    const submit = async () => {
        if (!file) {
            setError("Выберите XLS/XLSX файл");
            return;
        }
        setSubmitting(true);
        setError("");
        setSuccess("");
        try {
            const supplier = suppliers.find((item) => item.id === supplierId) ?? null;
            const response = await importStockReceiptXls({
                file,
                warehouse_id: typeof warehouseId === "number" ? warehouseId : null,
                supplier_id: typeof supplierId === "number" ? supplierId : null,
                supplier_code: supplier?.code ?? null,
                supplier_name: supplier?.name ?? "XLS import",
                received_at: receivedAt || null,
                comment: comment.trim(),
                mapping: Object.entries(mappingByKey)
                    .filter(([, variantId]) => Number(variantId) > 0)
                    .map(([mapKey, variantId]) => ({ map_key: mapKey, variant_id: Number(variantId) })),
            });
            setSuccess(response.message || "Приход создан");
            setUnresolved([]);
            setMappingByKey({});
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
            setSubmitting(false);
        }
    };

    const openManualLink = (row: ImportUnresolvedRow) => {
        setManualLink({
            row,
            productSearch: `${row.parsed?.brand || ""} ${row.parsed?.product_name || row.title || ""}`.trim(),
            products: [],
            productsLoading: false,
            selectedProductId: null,
            variants: [],
            variantsLoading: false,
            selectedVariantId: row.suggested_variant?.id ?? null,
        });
    };

    const searchProducts = async () => {
        if (!manualLink) return;
        setManualLink((prev) => (prev ? { ...prev, productsLoading: true } : prev));
        try {
            const res = await fetchProducts({ search: manualLink.productSearch || undefined, page: 1 });
            const products = res.data || [];
            const selectedProductId = products[0]?.id ?? null;
            setManualLink((prev) =>
                prev ? { ...prev, productsLoading: false, products, selectedProductId, variants: [], selectedVariantId: null } : prev
            );
            if (selectedProductId) {
                const variants = await fetchProductVariants(selectedProductId);
                setManualLink((prev) => (prev ? { ...prev, variants: variants.data || [], variantsLoading: false } : prev));
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Ошибка поиска товара");
            setManualLink((prev) => (prev ? { ...prev, productsLoading: false, variantsLoading: false } : prev));
        }
    };

    return (
        <AdminPageCard>
            <AdminTableToolbar
                title="Система: импорт приходов XLS"
                description="Процесс как Seller One: загрузка, ручная/авто связка и только потом создание прихода."
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
                <input type="file" accept=".xls,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full rounded-xl border px-3 py-2 text-sm" />
                <div className="grid gap-3 sm:grid-cols-2">
                    <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : "")} className="rounded-xl border px-3 py-2 text-sm">
                        <option value="">Склад</option>
                        {warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <select value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")} className="rounded-xl border px-3 py-2 text-sm">
                        <option value="">Поставщик</option>
                        {suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                </div>
                <input type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className="rounded-xl border px-3 py-2 text-sm" />
                <input value={comment} onChange={(e) => setComment(e.target.value)} className="rounded-xl border px-3 py-2 text-sm" />
                <button type="button" onClick={() => void submit()} disabled={submitting} className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white">
                    {submitting ? "Обработка..." : unresolved.length > 0 ? "Применить сопоставления" : "Загрузить XLS"}
                </button>
            </div>

            {unresolved.length > 0 ? (
                <div className="mt-4 overflow-x-auto rounded-xl border">
                    <table className="min-w-full text-xs">
                        <thead className="bg-gray-50 text-left text-gray-600">
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
                                                onChange={(e) => setMappingByKey((prev) => ({ ...prev, [row.map_key]: e.target.value }))}
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
            ) : null}

            {manualLink ? (
                <div className="fixed inset-0 z-[60] bg-black/50 p-4">
                    <div className="mx-auto flex h-full max-w-3xl items-center">
                        <div className="flex max-h-full w-full flex-col rounded-2xl bg-white">
                            <div className="flex items-center justify-between border-b px-5 py-4">
                                <div className="text-sm font-medium">{manualLink.row.title}</div>
                                <button type="button" onClick={() => setManualLink(null)} className="text-sm text-gray-500">Закрыть</button>
                            </div>
                            <div className="space-y-3 overflow-y-auto px-5 py-4">
                                <div className="flex gap-2">
                                    <input value={manualLink.productSearch} onChange={(e) => setManualLink((prev) => prev ? { ...prev, productSearch: e.target.value } : prev)} className="flex-1 rounded-xl border px-3 py-2 text-sm" />
                                    <button type="button" onClick={() => void searchProducts()} className="rounded-xl border px-3 py-2 text-sm">Найти</button>
                                </div>
                                <select value={manualLink.selectedProductId ?? ""} onChange={(e) => setManualLink((prev) => prev ? { ...prev, selectedProductId: Number(e.target.value || 0) || null } : prev)} className="w-full rounded-xl border px-3 py-2 text-sm">
                                    <option value="">Товар</option>
                                    {manualLink.products.map((p) => <option key={p.id} value={p.id}>{p.brand?.name ? `${p.brand.name} / ` : ""}{p.name}</option>)}
                                </select>
                                <select value={manualLink.selectedVariantId ?? ""} onChange={(e) => setManualLink((prev) => prev ? { ...prev, selectedVariantId: Number(e.target.value || 0) || null } : prev)} className="w-full rounded-xl border px-3 py-2 text-sm">
                                    <option value="">Вариант</option>
                                    {manualLink.variants.map((v) => <option key={v.id} value={v.id}>{formatVariantOptionLabel(v)}</option>)}
                                </select>
                            </div>
                            <div className="flex justify-end gap-2 border-t px-5 py-4">
                                <button type="button" onClick={() => setManualLink(null)} className="rounded-xl border px-4 py-2 text-sm">Отмена</button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!manualLink.selectedVariantId) return;
                                        setMappingByKey((prev) => ({ ...prev, [manualLink.row.map_key]: String(manualLink.selectedVariantId) }));
                                        setManualLink(null);
                                    }}
                                    className="rounded-xl bg-black px-4 py-2 text-sm text-white"
                                >
                                    Связать выбранный вариант
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </AdminPageCard>
    );
}


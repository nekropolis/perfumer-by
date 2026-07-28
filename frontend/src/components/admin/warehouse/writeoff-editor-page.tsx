"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import {
    createStockWriteoff,
    fetchStockBalances,
    fetchWarehouses,
    type StockBalanceItem,
    type StockWriteoffPayload,
    type WarehouseOption,
} from "@/lib/admin-warehouse-api";

type WriteoffFormItem = {
    product_id: number;
    variant_id: number;
    product_name: string;
    variant_title: string;
    qty: number;
    price: string;
    available_qty: number;
    reserved_qty: number;
    stock_source: "available" | "reserved";
};

type WriteoffFormState = {
    document_kind: "writeoff" | "reserve";
    warehouse_id: number | null;
    written_off_at: string;
    comment: string;
    items: WriteoffFormItem[];
};

type DraftWriteoffItem = {
    product_id: number | null;
    variant_id: number | null;
    product_query: string;
    variant_query: string;
    qty: number;
    price: string;
    stock_source: "available" | "reserved";
};

type ProductOption = {
    product_id: number;
    product_name: string;
};

const emptyDraftItem = (): DraftWriteoffItem => ({
    product_id: null,
    variant_id: null,
    product_query: "",
    variant_query: "",
    qty: 1,
    price: "",
    stock_source: "available",
});

const emptyForm = (): WriteoffFormState => ({
    document_kind: "writeoff",
    warehouse_id: null,
    written_off_at: new Date().toISOString().slice(0, 16),
    comment: "",
    items: [],
});

type PrefillItem = {
    warehouse_id?: number | null;
    product_id: number;
    variant_id: number;
    product_name: string;
    variant_title: string;
    price?: string | number | null;
    available_qty?: number;
    reserved_qty?: number;
};

type Props = {
    prefillItem?: PrefillItem | null;
};

export default function WriteoffEditorPage({ prefillItem }: Props) {
    const router = useRouter();

    const [form, setForm] = useState<WriteoffFormState>(emptyForm());
    const [draftItem, setDraftItem] = useState<DraftWriteoffItem>(emptyDraftItem());
    const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
    const [variantOptions, setVariantOptions] = useState<StockBalanceItem[]>([]);
    const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const totalWriteoffAmount = useMemo(
        () => form.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0),
        [form.items]
    );

    useEffect(() => {
        const loadWarehouses = async () => {
            try {
                const response = await fetchWarehouses();
                setWarehouses(response.data ?? []);
                const defaultWarehouse = (response.data ?? []).find((item) => item.code === "main");
                setForm((prev) => ({
                    ...prev,
                    warehouse_id: prefillItem?.warehouse_id ?? prev.warehouse_id ?? defaultWarehouse?.id ?? null,
                }));
            } catch (e) {
                setError(e instanceof Error ? e.message : "Не удалось загрузить склады");
            }
        };
        void loadWarehouses();
    }, [prefillItem?.warehouse_id]);

    useEffect(() => {
        if (!prefillItem) {
            return;
        }

        setForm((prev) => {
            const alreadyExists = prev.items.some(
                (item) => item.product_id === prefillItem.product_id && item.variant_id === prefillItem.variant_id
            );

            if (alreadyExists) {
                return prev;
            }

            const availableQty = Math.max(0, Number(prefillItem.available_qty ?? 0));
            const reservedQty = Math.max(0, Number(prefillItem.reserved_qty ?? 0));

            return {
                ...prev,
                items: [
                    ...prev.items,
                    {
                        product_id: prefillItem.product_id,
                        variant_id: prefillItem.variant_id,
                        product_name: prefillItem.product_name,
                        variant_title: prefillItem.variant_title,
                        qty: 1,
                        price: prefillItem.price != null ? String(prefillItem.price) : "",
                        available_qty: availableQty,
                        reserved_qty: reservedQty,
                        stock_source: availableQty > 0 ? "available" : reservedQty > 0 ? "reserved" : "available",
                    },
                ],
            };
        });
    }, [prefillItem]);

    const searchProducts = useCallback(async (query: string) => {
        try {
            const response = await fetchStockBalances({
                page: 1,
                search: query.trim() || undefined,
                stock_state: "in_stock",
                warehouse_id: form.warehouse_id ?? undefined,
            });

            const map = new Map<number, ProductOption>();
            (response.data ?? []).forEach((item) => {
                if (!item.product_id || !item.product_name) {
                    return;
                }

                if (!map.has(item.product_id)) {
                    map.set(item.product_id, {
                        product_id: item.product_id,
                        product_name: item.product_name,
                    });
                }
            });

            setProductOptions(Array.from(map.values()));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось загрузить товары со склада");
        }
    }, [form.warehouse_id]);

    const searchVariants = useCallback(
        async (productId: number, query: string, stockSource: "available" | "reserved") => {
            try {
                const response = await fetchStockBalances({
                    page: 1,
                    search: query.trim() || undefined,
                    stock_state: stockSource === "reserved" ? "reserved" : "in_stock",
                    warehouse_id: form.warehouse_id ?? undefined,
                });

                setVariantOptions(
                    (response.data ?? []).filter((item) => {
                        if (item.product_id !== productId) {
                            return false;
                        }
                        if (stockSource === "reserved") {
                            return Number(item.reserved_stock ?? 0) > 0;
                        }
                        return Number(item.available_stock ?? 0) > 0;
                    })
                );
            } catch (e) {
                setError(e instanceof Error ? e.message : "Не удалось загрузить варианты со склада");
            }
        },
        [form.warehouse_id]
    );

    const addDraftItem = () => {
        if (!draftItem.product_id) {
            setError("Выберите товар");
            return;
        }

        if (!draftItem.variant_id) {
            setError("Выберите вариант");
            return;
        }

        if (draftItem.qty <= 0) {
            setError("Укажите количество");
            return;
        }

        const selectedVariant = variantOptions.find(
            (item) => (item.variant_id ?? item.id) === draftItem.variant_id
        );
        const availableQty = Math.max(0, Number(selectedVariant?.available_stock ?? 0));
        const reservedQty = Math.max(0, Number(selectedVariant?.reserved_stock ?? 0));
        const effectiveSource: "available" | "reserved" =
            form.document_kind === "reserve" ? "available" : draftItem.stock_source;
        const maxForSource =
            effectiveSource === "reserved" ? reservedQty : availableQty;
        if (maxForSource <= 0) {
            setError(
                draftItem.stock_source === "reserved"
                    ? "Нет зарезервированного количества для списания"
                    : "Недостаточно доступного остатка для списания"
            );
            return;
        }
        if (draftItem.qty > maxForSource) {
            setError(`Можно списать не больше ${maxForSource} шт.`);
            return;
        }

        setError("");

        setForm((prev) => ({
            ...prev,
            items: [
                ...prev.items,
                {
                    product_id: draftItem.product_id!,
                    variant_id: draftItem.variant_id!,
                    product_name: draftItem.product_query,
                    variant_title: selectedVariant?.variant_title || draftItem.variant_query,
                    qty: draftItem.qty,
                    price: draftItem.price,
                    available_qty: availableQty,
                    reserved_qty: reservedQty,
                    stock_source: effectiveSource,
                },
            ],
        }));

        setDraftItem(emptyDraftItem());
        setProductOptions([]);
        setVariantOptions([]);
        setIsAddModalOpen(false);
    };

    const submit = async () => {
        setSaving(true);
        setError("");

        try {
            if (!form.warehouse_id) {
                throw new Error("Выберите склад");
            }

            if (form.items.length === 0) {
                throw new Error("Добавьте хотя бы одну строку списания");
            }
            form.items.forEach((item, index) => {
                if (item.qty <= 0) {
                    throw new Error(`Строка ${index + 1}: укажите количество`);
                }
                const cap = item.stock_source === "reserved" ? item.reserved_qty : item.available_qty;
                if (cap > 0 && item.qty > cap) {
                    throw new Error(
                        `Строка ${index + 1}: можно списать максимум ${cap} шт. (${item.stock_source === "reserved" ? "резерв" : "свободно"})`
                    );
                }
            });

            const payload: StockWriteoffPayload = {
                document_kind: form.document_kind,
                warehouse_id: form.warehouse_id,
                written_off_at: form.written_off_at || null,
                comment: form.comment.trim(),
                items: form.items.map((item) => ({
                    product_id: item.product_id,
                    variant_id: item.variant_id,
                    qty: item.qty,
                    price: item.price === "" ? null : Number(item.price),
                    stock_source: item.stock_source,
                })),
            };

            await createStockWriteoff(payload);
            router.push("/admin/warehouse/writeoffs");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось создать списание");
        } finally {
            setSaving(false);
        }
    };

    return (
        <AdminPageCard>
            <Breadcrumbs
                className="mb-4"
                items={[
                    { label: "Админка", href: "/admin" },
                    { label: "Склад", href: "/admin/warehouse/writeoffs" },
                    { label: "Списания", href: "/admin/warehouse/writeoffs" },
                    { label: "Новое списание" },
                ]}
            />

            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
                        {form.document_kind === "reserve" ? "Новый резерв" : "Новое списание"}
                    </h1>
                    <p className="mt-1 text-sm text-slate-600">
                        {form.document_kind === "reserve"
                            ? "Ручной документ резерва. Добавляет резерв на выбранном складе без изменения фактического остатка."
                            : "Списание со свободного остатка или из резерва. Отмена движений на складе поставщика не поддерживается."}
                    </p>
                </div>

                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <Link
                        href="/admin/warehouse/writeoffs"
                        className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-admin-border bg-admin-surface px-4 text-sm font-medium text-admin-text hover:bg-admin-muted sm:w-auto"
                    >
                        Назад
                    </Link>
                    <button
                        type="button"
                        onClick={() => void submit()}
                        disabled={saving}
                        className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-admin-primary px-4 text-sm font-medium text-white hover:bg-admin-primary-hover disabled:opacity-60 sm:w-auto"
                    >
                        {saving ? "Сохраняем..." : form.document_kind === "reserve" ? "Сохранить резерв" : "Сохранить списание"}
                    </button>
                </div>
            </div>

            {error ? (
                <div className="mb-4">
                    <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
                </div>
            ) : null}

            <div className="space-y-4">
                <div className="rounded-xl border border-admin-border bg-admin-surface shadow-admin-card p-3 shadow-sm sm:p-4">
                    <div className="mb-3 flex flex-wrap gap-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                        <label className="flex cursor-pointer items-center gap-2">
                            <input
                                type="radio"
                                name="document-kind"
                                checked={form.document_kind === "writeoff"}
                                onChange={() => setForm((prev) => ({ ...prev, document_kind: "writeoff" }))}
                                className="h-4 w-4"
                            />
                            <span>Списание</span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-2">
                            <input
                                type="radio"
                                name="document-kind"
                                checked={form.document_kind === "reserve"}
                                onChange={() => setForm((prev) => ({ ...prev, document_kind: "reserve" }))}
                                className="h-4 w-4"
                            />
                            <span>Резерв</span>
                        </label>
                    </div>

                    <div className="flex flex-nowrap items-end gap-3">
                        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                            <span className="text-slate-600">Склад</span>
                            <select
                                value={form.warehouse_id ?? ""}
                                onChange={(e) => setForm((prev) => ({ ...prev, warehouse_id: e.target.value ? Number(e.target.value) : null }))}
                                className="h-10 rounded-lg border border-admin-border bg-slate-50 px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-admin-primary focus:bg-white"
                            >
                                <option value="">Выберите склад</option>
                                {warehouses.map((warehouse) => (
                                    <option key={warehouse.id} value={warehouse.id}>
                                        {warehouse.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                            <span className="text-slate-600">Дата списания</span>
                            <input
                                type="datetime-local"
                                value={form.written_off_at}
                                onChange={(e) => setForm((prev) => ({ ...prev, written_off_at: e.target.value }))}
                                className="h-10 rounded-lg border border-admin-border bg-slate-50 px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-admin-primary focus:bg-white"
                            />
                        </label>
                    </div>

                    <label className="mt-3 flex flex-col gap-1 text-sm">
                        <span className="text-slate-600">Комментарий</span>
                        <textarea
                            value={form.comment}
                            onChange={(e) => setForm((prev) => ({ ...prev, comment: e.target.value }))}
                            className="min-h-16 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-admin-primary focus:bg-white"
                            placeholder={form.document_kind === "reserve" ? "Причина резерва" : "Причина списания"}
                        />
                    </label>
                </div>

                <div className="rounded-xl border border-admin-border bg-admin-surface shadow-admin-card shadow-sm">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                        <div className="text-sm font-semibold text-slate-900">
                            Документ
                            <span className="ml-3 text-sm font-normal text-slate-500">
                                Сумма: <span className="font-semibold text-slate-900">{totalWriteoffAmount.toFixed(2)}</span>
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsAddModalOpen(true)}
                            className="inline-flex h-10 items-center justify-center rounded-lg bg-admin-primary px-4 text-sm font-medium text-white hover:bg-admin-primary-hover"
                        >
                            Добавить товар
                        </button>
                    </div>

                    <div className="p-3 sm:p-4">
                        {form.items.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                                {form.document_kind === "reserve"
                                    ? "Пока нет строк. Добавьте варианты со свободным остатком для ручного резерва."
                                    : "Пока нет строк. Добавьте варианты со свободным остатком или с активным резервом на выбранном складе."}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {form.items.map((item, index) => {
                                    const lineMax =
                                        item.stock_source === "reserved" ? item.reserved_qty : item.available_qty;
                                    const maxInput = Math.max(1, lineMax || 1);

                                    return (
                                        <div
                                            key={`${item.product_id}-${item.variant_id}-${index}`}
                                            className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 md:flex-row md:items-center md:justify-between"
                                        >
                                            <div className="min-w-0">
                                                <span>{item.product_name}</span>
                                                <span className="mx-2 text-slate-300">/</span>
                                                <span>{item.variant_title}</span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 text-sm md:gap-3">
                                                <label className="flex items-center gap-1 text-xs text-slate-600">
                                                    <span>Источник</span>
                                                    <select
                                                        value={item.stock_source}
                                                        onChange={(e) => {
                                                            const next = e.target.value as "available" | "reserved";
                                                            setForm((prev) => ({
                                                                ...prev,
                                                                items: prev.items.map((row, rowIndex) => {
                                                                    if (rowIndex !== index) {
                                                                        return row;
                                                                    }
                                                                    const cap =
                                                                        next === "reserved" ? row.reserved_qty : row.available_qty;
                                                                    return {
                                                                        ...row,
                                                                        stock_source: next,
                                                                        qty: Math.min(row.qty, Math.max(1, cap || 1)),
                                                                    };
                                                                }),
                                                            }));
                                                        }}
                                                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs"
                                                        disabled={form.document_kind === "reserve"}
                                                    >
                                                        <option value="available">Свободно</option>
                                                        <option value="reserved" disabled={item.reserved_qty <= 0}>
                                                            Резерв
                                                        </option>
                                                    </select>
                                                </label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={maxInput}
                                                        value={item.qty}
                                                        onChange={(e) => {
                                                            const raw = Number(e.target.value || 1);
                                                            const bounded = Math.min(Math.max(1, raw), maxInput);
                                                            setForm((prev) => ({
                                                                ...prev,
                                                                items: prev.items.map((row, rowIndex) =>
                                                                    rowIndex === index ? { ...row, qty: bounded } : row
                                                                ),
                                                            }));
                                                        }}
                                                        className="h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                                                    />
                                                    <span className="text-xs text-slate-500">
                                                        св. {item.available_qty} / рез. {item.reserved_qty}
                                                    </span>
                                                </div>
                                                <span>{item.price || "—"}</span>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setForm((prev) => ({
                                                            ...prev,
                                                            items: prev.items.filter((_, rowIndex) => rowIndex !== index),
                                                        }))
                                                    }
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isAddModalOpen ? (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4"
                    role="presentation"
                >
                    <div
                        className="w-full max-w-3xl rounded-xl border border-admin-border bg-admin-surface shadow-admin-card shadow-2xl"
                        role="dialog"
                        aria-modal="true"
                    >
                        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
                            <div>
                                <h2 className="text-base font-semibold text-slate-900">Добавить товар</h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    Выберите источник: свободный остаток или резерв, затем вариант со склада.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(false)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-lg text-slate-500 hover:bg-slate-50"
                            >
                                ×
                            </button>
                        </div>

                        <div className="space-y-3 p-4">
                            <div className="flex flex-wrap gap-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                                <label className="flex cursor-pointer items-center gap-2">
                                    <input
                                        type="radio"
                                        name="writeoff-stock-source"
                                        checked={draftItem.stock_source === "available" || form.document_kind === "reserve"}
                                        onChange={() => {
                                            const productId = draftItem.product_id;
                                            setDraftItem((prev) => ({
                                                ...prev,
                                                stock_source: "available",
                                                variant_id: null,
                                                variant_query: "",
                                            }));
                                            setVariantOptions([]);
                                            if (productId) {
                                                void searchVariants(productId, "", "available");
                                            }
                                        }}
                                        className="h-4 w-4"
                                        disabled={form.document_kind === "reserve"}
                                    />
                                    <span>Свободный остаток</span>
                                </label>
                                <label className="flex cursor-pointer items-center gap-2">
                                    <input
                                        type="radio"
                                        name="writeoff-stock-source"
                                        checked={draftItem.stock_source === "reserved"}
                                        onChange={() => {
                                            const productId = draftItem.product_id;
                                            setDraftItem((prev) => ({
                                                ...prev,
                                                stock_source: "reserved",
                                                variant_id: null,
                                                variant_query: "",
                                            }));
                                            setVariantOptions([]);
                                            if (productId) {
                                                void searchVariants(productId, "", "reserved");
                                            }
                                        }}
                                        className="h-4 w-4"
                                        disabled={form.document_kind === "reserve"}
                                    />
                                    <span>Резерв</span>
                                </label>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="min-w-0">
                                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Товар
                                    </label>
                                    <div className="relative">
                                        <input
                                            value={draftItem.product_query}
                                            onChange={(e) => {
                                                const nextQuery = e.target.value;
                                                setDraftItem((prev) => ({
                                                    ...prev,
                                                    product_query: nextQuery,
                                                    product_id: null,
                                                    variant_id: null,
                                                    variant_query: "",
                                                }));
                                                void searchProducts(nextQuery);
                                            }}
                                            className="h-10 w-full rounded-lg border border-admin-border bg-white px-3 pr-10 text-sm shadow-sm outline-none transition focus:border-admin-primary"
                                            placeholder="Начните вводить название товара"
                                        />
                                    </div>

                                    {draftItem.product_id == null && draftItem.product_query.trim() !== "" ? (
                                        <div className="mt-2 max-h-44 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                                            {productOptions.slice(0, 8).map((product) => (
                                                <button
                                                    key={product.product_id}
                                                    type="button"
                                                    onClick={() => {
                                                        setDraftItem((prev) => ({
                                                            ...prev,
                                                            product_id: product.product_id,
                                                            product_query: product.product_name,
                                                            variant_id: null,
                                                            variant_query: "",
                                                        }));
                                                    }}
                                                    className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 last:border-b-0"
                                                >
                                                    {product.product_name}
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>

                                <div className="min-w-0">
                                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Вариант
                                    </label>
                                    <input
                                        value={draftItem.variant_query}
                                        onChange={(e) => {
                                            const nextQuery = e.target.value;
                                            setDraftItem((prev) => ({
                                                ...prev,
                                                variant_query: nextQuery,
                                                variant_id: null,
                                            }));

                                            if (draftItem.product_id) {
                                                void searchVariants(draftItem.product_id, nextQuery, draftItem.stock_source);
                                            }
                                        }}
                                        className="h-10 w-full rounded-lg border border-admin-border bg-white px-3 text-sm shadow-sm outline-none transition focus:border-admin-primary"
                                        placeholder="Поиск варианта"
                                    />

                                    {draftItem.variant_query.trim() !== "" && variantOptions.length > 0 ? (
                                        <div className="mt-2 max-h-44 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                                            {variantOptions.slice(0, 12).map((variant) => (
                                                <button
                                                    key={variant.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setDraftItem((prev) => ({
                                                            ...prev,
                                                            variant_id: variant.variant_id ?? variant.id,
                                                            variant_query: variant.variant_title,
                                                            price: variant.price != null ? String(variant.price) : prev.price,
                                                        }));
                                                        setVariantOptions([]);
                                                    }}
                                                    className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                                                >
                                                    <span className="min-w-0 truncate">{variant.variant_title}</span>
                                                    <span className="ml-3 shrink-0 text-[11px] text-slate-600">
                                                        св. {variant.available_stock} · рез. {variant.reserved_stock}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            <div className="flex flex-nowrap items-end gap-3">
                                <div className="min-w-0 flex-1">
                                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Цена
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={draftItem.price}
                                        onChange={(e) => setDraftItem((prev) => ({ ...prev, price: e.target.value }))}
                                        className="h-10 w-full rounded-lg border border-admin-border bg-white px-3 text-sm shadow-sm outline-none transition focus:border-admin-primary"
                                    />
                                </div>
                                <div className="w-[120px] min-w-[120px] shrink-0">
                                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Кол-во
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={draftItem.qty}
                                        onChange={(e) => setDraftItem((prev) => ({ ...prev, qty: Math.max(1, Number(e.target.value || 1)) }))}
                                        className="h-10 w-full rounded-lg border border-admin-border bg-white px-3 text-sm shadow-sm outline-none transition focus:border-admin-primary"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-4 py-4 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(false)}
                                className="inline-flex h-10 items-center justify-center rounded-lg border border-admin-border px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                                Отмена
                            </button>
                            <button
                                type="button"
                                onClick={addDraftItem}
                                className="inline-flex h-10 items-center justify-center rounded-lg bg-admin-primary px-4 text-sm font-medium text-white hover:bg-admin-primary-hover"
                            >
                                Добавить
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </AdminPageCard>
    );
}

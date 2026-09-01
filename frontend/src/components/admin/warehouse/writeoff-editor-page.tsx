"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import { adminCheckbox } from "@/lib/admin-ui-classes";
import useDebouncedValue from "@/hooks/use-debounced-value";
import {
    createStockWriteoff,
    fetchStockBalances,
    fetchStockBalanceVariantSuppliers,
    fetchWarehouses,
    type StockBalanceItem,
    type StockBalanceVariantSupplierRow,
    type StockWriteoffPayload,
    type WarehouseOption,
} from "@/lib/admin-warehouse-api";
import { highlightAdminSearchTerms } from "@/lib/admin-search-highlight";

type WriteoffFormItem = {
    product_id: number;
    variant_id: number;
    stock_lot_id: number;
    product_name: string;
    variant_title: string;
    lot_comment?: string | null;
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
    stock_lot_id: number | null;
    product_query: string;
    product_name: string;
    variant_title: string;
    qty: number;
    price: string;
    stock_source: "available" | "reserved";
    available_qty: number;
    reserved_qty: number;
};

const emptyDraftItem = (): DraftWriteoffItem => ({
    product_id: null,
    variant_id: null,
    stock_lot_id: null,
    product_query: "",
    product_name: "",
    variant_title: "",
    qty: 1,
    price: "",
    stock_source: "available",
    available_qty: 0,
    reserved_qty: 0,
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
    stock_lot_id?: number | null;
};

type Props = {
    prefillItem?: PrefillItem | null;
};

export default function WriteoffEditorPage({ prefillItem }: Props) {
    const router = useRouter();

    const [form, setForm] = useState<WriteoffFormState>(emptyForm());
    const [draftItem, setDraftItem] = useState<DraftWriteoffItem>(emptyDraftItem());
    const [stockHits, setStockHits] = useState<StockBalanceItem[]>([]);
    const [stockHitsLoading, setStockHitsLoading] = useState(false);
    const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [lotOptions, setLotOptions] = useState<StockBalanceVariantSupplierRow[]>([]);
    const [lotsLoading, setLotsLoading] = useState(false);
    const debouncedProductQuery = useDebouncedValue(draftItem.product_query, 350);

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

    const loadLotsForDraft = useCallback(
        async (variantId: number, stockSource: "available" | "reserved", preselectLotId?: number | null) => {
            setLotsLoading(true);
            try {
                const response = await fetchStockBalanceVariantSuppliers({
                    variant_id: variantId,
                    warehouse_id: form.warehouse_id,
                });
                const lots = (response.data ?? []).filter(
                    (row) =>
                        row.source === "lot"
                        && typeof row.lot_id === "number"
                        && Number(row.available ?? 0) > 0,
                );
                setLotOptions(lots);

                if (lots.length === 1) {
                    const lot = lots[0];
                    setDraftItem((prev) => ({
                        ...prev,
                        stock_lot_id: lot.lot_id ?? null,
                        price:
                            lot.supplier_price != null
                                ? String(lot.supplier_price)
                                : prev.price,
                    }));
                } else if (preselectLotId && lots.some((l) => l.lot_id === preselectLotId)) {
                    const lot = lots.find((l) => l.lot_id === preselectLotId);
                    setDraftItem((prev) => ({
                        ...prev,
                        stock_lot_id: preselectLotId,
                        price:
                            lot?.supplier_price != null ? String(lot.supplier_price) : prev.price,
                    }));
                } else {
                    setDraftItem((prev) => ({ ...prev, stock_lot_id: null }));
                }
            } catch (e) {
                setLotOptions([]);
                setError(e instanceof Error ? e.message : "Не удалось загрузить партии");
            } finally {
                setLotsLoading(false);
            }
        },
        [form.warehouse_id],
    );

    useEffect(() => {
        if (!isAddModalOpen || !draftItem.variant_id) {
            if (!isAddModalOpen) {
                setLotOptions([]);
            }
            return;
        }
        void loadLotsForDraft(draftItem.variant_id, draftItem.stock_source);
    }, [
        isAddModalOpen,
        draftItem.variant_id,
        draftItem.stock_source,
        form.warehouse_id,
        loadLotsForDraft,
    ]);

    useEffect(() => {
        if (!isAddModalOpen) {
            setStockHits([]);
            setStockHitsLoading(false);
            return;
        }

        const query = debouncedProductQuery.trim();
        if (query.length < 2 || draftItem.product_id != null) {
            setStockHits([]);
            setStockHitsLoading(false);
            return;
        }

        let cancelled = false;
        setStockHitsLoading(true);

        void fetchStockBalances({
            page: 1,
            per_page: 25,
            search: query,
            stock_state: form.document_kind === "reserve" ? "available" : undefined,
            warehouse_id: form.warehouse_id ?? undefined,
        })
            .then((response) => {
                if (cancelled) {
                    return;
                }
                setStockHits(
                    (response.data ?? []).filter((item) => {
                        if (form.document_kind === "reserve") {
                            return Number(item.available_stock ?? 0) > 0;
                        }
                        return Number(item.available_stock ?? 0) > 0 || Number(item.reserved_stock ?? 0) > 0;
                    }),
                );
            })
            .catch((e) => {
                if (!cancelled) {
                    setStockHits([]);
                    setError(e instanceof Error ? e.message : "Не удалось загрузить товары со склада");
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setStockHitsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [
        debouncedProductQuery,
        draftItem.product_id,
        isAddModalOpen,
        form.document_kind,
        form.warehouse_id,
    ]);

    useEffect(() => {
        if (!prefillItem) {
            return;
        }

        const availableQty = Math.max(0, Number(prefillItem.available_qty ?? 0));
        const reservedQty = Math.max(0, Number(prefillItem.reserved_qty ?? 0));
        const stockSource = availableQty > 0 ? "available" : reservedQty > 0 ? "reserved" : "available";

        setDraftItem({
            product_id: prefillItem.product_id,
            variant_id: prefillItem.variant_id,
            stock_lot_id:
                typeof prefillItem.stock_lot_id === "number" && prefillItem.stock_lot_id > 0
                    ? prefillItem.stock_lot_id
                    : null,
            product_query: "",
            product_name: prefillItem.product_name,
            variant_title: prefillItem.variant_title,
            qty: 1,
            price: prefillItem.price != null ? String(prefillItem.price) : "",
            stock_source: stockSource,
            available_qty: availableQty,
            reserved_qty: reservedQty,
        });
        setIsAddModalOpen(true);
        void loadLotsForDraft(prefillItem.variant_id, stockSource, prefillItem.stock_lot_id);
    }, [prefillItem, loadLotsForDraft]);

    const selectedDraftLot = useMemo(
        () => lotOptions.find((row) => row.lot_id === draftItem.stock_lot_id) ?? null,
        [lotOptions, draftItem.stock_lot_id],
    );

    const draftLotMaxQty = useMemo(() => {
        if (!selectedDraftLot) {
            return Math.max(0, draftItem.available_qty);
        }
        return Math.max(0, Number(selectedDraftLot.available ?? 0));
    }, [selectedDraftLot, draftItem.available_qty]);

    const pickStockItem = (item: StockBalanceItem) => {
        const productName =
            [item.brand_name, item.product_name].filter(Boolean).join(" ").trim() || item.product_name || "";
        const variantTitle = item.variant_title;
        const availableQty = Math.max(0, Number(item.available_stock ?? 0));
        const reservedQty = Math.max(0, Number(item.reserved_stock ?? 0));

        setDraftItem((prev) => ({
            ...prev,
            product_id: item.product_id,
            variant_id: item.variant_id ?? item.id,
            product_name: productName,
            variant_title: variantTitle,
            product_query: `${item.product_id} — ${productName} ${variantTitle}`.trim(),
            stock_lot_id: null,
            price: "",
            stock_source: "available",
            available_qty: availableQty,
            reserved_qty: reservedQty,
        }));
        setStockHits([]);
        setError("");
    };

    const clearPickedProduct = () => {
        setDraftItem((prev) => ({
            ...prev,
            product_query: "",
            product_id: null,
            variant_id: null,
            product_name: "",
            variant_title: "",
            stock_lot_id: null,
            available_qty: 0,
            reserved_qty: 0,
        }));
        setStockHits([]);
        setLotOptions([]);
    };

    const addDraftItem = () => {
        if (!draftItem.product_id || !draftItem.variant_id) {
            setError("Выберите товар и вариант");
            return;
        }

        if (!draftItem.stock_lot_id) {
            setError("Выберите партию (лот)");
            return;
        }

        if (draftItem.qty <= 0) {
            setError("Укажите количество");
            return;
        }

        const availableQty = Math.max(0, Number(selectedDraftLot?.available ?? draftItem.available_qty ?? 0));
        const reservedQty = Math.max(0, Number(selectedDraftLot?.reserved_qty ?? draftItem.reserved_qty ?? 0));
        const maxForSource = selectedDraftLot ? draftLotMaxQty : availableQty;
        if (maxForSource <= 0) {
            setError("Недостаточно свободного остатка");
            return;
        }
        if (draftItem.qty > maxForSource) {
            setError(
                form.document_kind === "reserve"
                    ? `Можно зарезервировать не больше ${maxForSource} шт.`
                    : `Можно списать не больше ${maxForSource} шт.`
            );
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
                    stock_lot_id: draftItem.stock_lot_id ?? 0,
                    product_name: draftItem.product_name,
                    variant_title: draftItem.variant_title,
                    lot_comment: selectedDraftLot?.comment ?? null,
                    qty: draftItem.qty,
                    price:
                        selectedDraftLot?.supplier_price != null
                            ? String(selectedDraftLot.supplier_price)
                            : "",
                    available_qty: availableQty,
                    reserved_qty: reservedQty,
                    stock_source: "available",
                },
            ],
        }));

        setDraftItem(emptyDraftItem());
        setStockHits([]);
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
                if (!item.stock_lot_id) {
                    throw new Error(`Строка ${index + 1}: укажите партию`);
                }
                if (item.qty > item.available_qty) {
                    throw new Error(
                        form.document_kind === "reserve"
                            ? `Строка ${index + 1}: можно зарезервировать максимум ${item.available_qty} шт.`
                            : `Строка ${index + 1}: можно списать максимум ${item.available_qty} шт.`
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
                    stock_source: "available",
                    stock_lot_id: item.stock_lot_id,
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
                    <div className="flex flex-nowrap items-end gap-3">
                        <label className="flex w-[168px] shrink-0 flex-col gap-1 text-sm">
                            <span className="text-slate-600">Тип</span>
                            <AdminStatusDropdown
                                value={form.document_kind}
                                onChangeAction={(value) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        document_kind: value === "reserve" ? "reserve" : "writeoff",
                                    }))
                                }
                                options={[
                                    { value: "writeoff", label: "Списание" },
                                    { value: "reserve", label: "Резерв" },
                                ]}
                                widthClassName="w-full"
                            />
                        </label>
                        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                            <span className="text-slate-600">Склад</span>
                            <AdminStatusDropdown
                                value={form.warehouse_id != null ? String(form.warehouse_id) : ""}
                                onChangeAction={(value) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        warehouse_id: value ? Number(value) : null,
                                    }))
                                }
                                options={warehouses.map((warehouse) => ({
                                    value: String(warehouse.id),
                                    label: warehouse.name,
                                }))}
                                placeholder="Выберите склад"
                                widthClassName="w-full"
                            />
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
                            onClick={() => {
                                setDraftItem(emptyDraftItem());
                                setStockHits([]);
                                setLotOptions([]);
                                setIsAddModalOpen(true);
                            }}
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
                                    : "Пока нет строк. Добавьте варианты со свободным остатком на выбранном складе."}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {form.items.map((item, index) => {
                                    const maxInput = Math.max(1, item.available_qty || 1);

                                    return (
                                        <div
                                            key={`${item.product_id}-${item.variant_id}-${item.stock_lot_id}-${index}`}
                                            className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 md:flex-row md:items-center md:justify-between"
                                        >
                                            <div className="min-w-0">
                                                <span>{item.product_name}</span>
                                                <span className="mx-2 text-slate-300">/</span>
                                                <span>{item.variant_title}</span>
                                                {item.stock_lot_id ? (
                                                    <span className="ml-2 text-xs text-slate-500">
                                                        лот #{item.stock_lot_id}
                                                        {item.lot_comment?.trim()
                                                            ? ` · ${item.lot_comment.trim()}`
                                                            : ""}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 text-sm md:gap-3">
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
                                                        {item.available_qty}
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
                            <div className="w-full min-w-0">
                                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                    Товар и вариант
                                </label>
                                {draftItem.product_id != null ? (
                                    <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2.5">
                                        <div className="min-w-0 flex-1 break-words text-sm leading-snug text-slate-900">
                                            <span className="tabular-nums text-slate-500">
                                                {draftItem.product_id}
                                            </span>
                                            <span className="text-slate-400"> — </span>
                                            <span className="font-medium">{draftItem.product_name}</span>
                                            {draftItem.variant_title ? (
                                                <>
                                                    <span className="text-slate-400"> / </span>
                                                    <span>{draftItem.variant_title}</span>
                                                </>
                                            ) : null}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={clearPickedProduct}
                                            className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-white px-2 text-xs text-slate-600 hover:bg-slate-50"
                                        >
                                            Сменить
                                        </button>
                                    </div>
                                ) : (
                                    <>
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
                                                        product_name: "",
                                                        variant_title: "",
                                                        stock_lot_id: null,
                                                    }));
                                                }}
                                                className="h-10 w-full rounded-lg border border-admin-border bg-white px-3 pr-10 text-sm shadow-sm outline-none transition focus:border-admin-primary"
                                                placeholder="Название, бренд или артикул"
                                            />
                                            {draftItem.product_query ? (
                                                <button
                                                    type="button"
                                                    onClick={clearPickedProduct}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                                >
                                                    ×
                                                </button>
                                            ) : null}
                                        </div>

                                        {stockHitsLoading
                                        || stockHits.length > 0
                                        || debouncedProductQuery.trim().length >= 2 ? (
                                            <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                                                {stockHitsLoading ? (
                                                    <div className="px-3 py-2 text-xs text-slate-500">Поиск…</div>
                                                ) : stockHits.length === 0 ? (
                                                    <div className="px-3 py-2 text-xs text-slate-500">Ничего не найдено</div>
                                                ) : (
                                                    stockHits.slice(0, 12).map((item) => {
                                                        const q = draftItem.product_query;
                                                        const productLabel =
                                                            [item.brand_name, item.product_name]
                                                                .filter(Boolean)
                                                                .join(" ")
                                                            || item.product_name
                                                            || "—";
                                                        const variantId = item.variant_id ?? item.id;

                                                        return (
                                                            <button
                                                                key={`${item.product_id}-${variantId}-${item.warehouse_id ?? 0}`}
                                                                type="button"
                                                                onMouseDown={(e) => e.preventDefault()}
                                                                onClick={() => pickStockItem(item)}
                                                                className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-slate-50"
                                                            >
                                                                <span className="min-w-0">
                                                                    <span className="tabular-nums text-slate-400">
                                                                        {highlightAdminSearchTerms(String(item.product_id), q)}
                                                                    </span>
                                                                    <span className="text-slate-300"> — </span>
                                                                    <span className="font-medium text-slate-900">
                                                                        {highlightAdminSearchTerms(productLabel, q, item.brand_name)}
                                                                    </span>
                                                                    <span className="text-slate-300"> </span>
                                                                    <span className="text-slate-700">
                                                                        {highlightAdminSearchTerms(item.variant_title, q, item.brand_name)}
                                                                    </span>
                                                                </span>
                                                                <span className="ml-3 shrink-0 text-[11px] text-slate-600">
                                                                    св. {item.available_stock} · рез. {item.reserved_stock}
                                                                </span>
                                                            </button>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        ) : null}
                                    </>
                                )}
                            </div>

                            {draftItem.variant_id ? (
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Партия (лот)
                                    </p>
                                    {lotsLoading ? (
                                        <p className="text-sm text-slate-500">Загрузка партий…</p>
                                    ) : lotOptions.length === 0 ? (
                                        <p className="text-sm text-amber-800">Нет открытых партий для этого варианта.</p>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {lotOptions.map((lot) => {
                                                const lotId = lot.lot_id!;
                                                const maxQty = Math.max(0, Number(lot.available ?? 0));
                                                const selected = draftItem.stock_lot_id === lotId;
                                                const leftLabel = [
                                                    `#${lotId}`,
                                                    lot.supplier_name?.trim() || "—",
                                                    lot.supplier_sku?.trim() || "—",
                                                    lot.supplier_product_name?.trim() || "—",
                                                ].join(" - ");
                                                const rightLabel = [
                                                    lot.available ?? "—",
                                                    lot.supplier_price != null ? String(lot.supplier_price) : "—",
                                                ].join(" / ");
                                                return (
                                                    <label
                                                        key={`lot-${lotId}`}
                                                        className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                                                            selected
                                                                ? "border-admin-primary bg-white"
                                                                : "border-slate-200 bg-white/80"
                                                        }`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="writeoff-lot"
                                                            className={adminCheckbox}
                                                            checked={selected}
                                                            onChange={() =>
                                                                setDraftItem((prev) => ({
                                                                    ...prev,
                                                                    stock_lot_id: lotId,
                                                                    price:
                                                                        lot.supplier_price != null
                                                                            ? String(lot.supplier_price)
                                                                            : prev.price,
                                                                    qty: Math.min(prev.qty, Math.max(1, maxQty || 1)),
                                                                }))
                                                            }
                                                        />
                                                        <span className="min-w-0 flex-1 truncate text-slate-800" title={leftLabel}>
                                                            {leftLabel}
                                                        </span>
                                                        <span className="shrink-0 tabular-nums text-slate-600">
                                                            {rightLabel}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ) : null}

                            <div className="w-[120px] min-w-[120px]">
                                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                    Кол-во
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={Math.max(1, draftLotMaxQty || 1)}
                                    value={draftItem.qty}
                                    onChange={(e) => {
                                        const cap = Math.max(1, draftLotMaxQty || 1);
                                        setDraftItem((prev) => ({
                                            ...prev,
                                            qty: Math.min(Math.max(1, Number(e.target.value || 1)), cap),
                                        }));
                                    }}
                                    className="h-10 w-full rounded-lg border border-admin-border bg-white px-3 text-sm shadow-sm outline-none transition focus:border-admin-primary"
                                />
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

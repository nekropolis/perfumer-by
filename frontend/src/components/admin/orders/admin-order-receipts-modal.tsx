"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { OrderData, OrderItem } from "@/types/orders";
import { lineItemProductTitle } from "@/lib/product-display-name";
import { syncReceiptMadeInCountries } from "@/lib/admin-orders-api";

type ReceiptItemDraft = {
    key: string;
    productId: number | null;
    name: string;
    qty: number;
    price: string;
    total: string;
    country: string;
    originalCountry: string;
};

type ReceiptDraft = {
    orderId: number;
    printDate: string;
    deliveryLabel: string;
    deliveryFee: string;
    /** Скидка по дисконтной карте, руб. (не %). */
    discountAmount: string;
    total: string;
    items: ReceiptItemDraft[];
};

type Props = {
    orders: OrderData[];
    countryOptions: string[];
    onCloseAction: () => void;
};

const COMPANY_NAME = "ИП Гришкевич П.А.";
const COMPANY_UNP = "191168408";

function normalizeMoneyForDisplay(value?: string | null): string {
    const text = String(value ?? "0.00").trim();
    return text.replace(".", ",");
}

function moneyToCents(value?: string | null): number {
    const normalized = String(value ?? "")
        .replace(/\u00a0/g, "")
        .replace(/\s/g, "")
        .replace(",", ".")
        .trim();

    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
        return 0;
    }

    const [rubles, cents = ""] = normalized.split(".");
    return Number(rubles) * 100 + Number(cents.padEnd(2, "0"));
}

const CONCENTRATION_LABELS: Record<string, string> = {
    edt: "Туалетная вода",
    edp: "Парфюмерная вода",
    edc: "Одеколон",
    parfum: "Духи",
    "extrait de parfum": "Духи",
};

function extractConcentrationLabel(variantTitle: string): string | null {
    const normalized = variantTitle.trim();
    if (!normalized) {
        return null;
    }

    const lower = normalized.toLocaleLowerCase("ru-RU");

    for (const label of Object.values(CONCENTRATION_LABELS)) {
        if (lower.includes(label.toLocaleLowerCase("ru-RU"))) {
            return label;
        }
    }

    for (const [code, label] of Object.entries(CONCENTRATION_LABELS)) {
        const pattern = new RegExp(`\\b${code.replace(/\s+/g, "\\s+")}\\b`, "i");
        if (pattern.test(normalized)) {
            return label;
        }
    }

    return null;
}

function stripConcentrationCodeFromVariant(variantTitle: string): string {
    return variantTitle
        .replace(/\s*\/\s*(edt|edp|edc|parfum|extrait\s+de\s+parfum)\b/gi, "")
        .replace(/\s*-\s*(туалетная вода|парфюмерная вода|одеколон|духи)\b/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

function receiptItemDisplayName(item: OrderItem): string {
    const productName = lineItemProductTitle(item).trim() || "Товар";
    const variantTitle = String(item.variant_title ?? "").trim();
    const concentrationLabel = extractConcentrationLabel(variantTitle);
    const variantPart = concentrationLabel
        ? stripConcentrationCodeFromVariant(variantTitle)
        : variantTitle;

    return [productName, concentrationLabel, variantPart].filter(Boolean).join(" ");
}

function deliveryLabel(order: OrderData): string {
    const label = (order.delivery_method_label || order.delivery_method || "").trim();
    if (!label) {
        return "Доставка";
    }

    return `Доставка ${label.toLocaleLowerCase("ru-RU")}`;
}

/** Дата на чеке: delivery_date, иначе shipment_date, иначе сегодня. */
function receiptPrintDate(order: OrderData): string {
    const raw = order.delivery_date?.trim() || order.shipment_date?.trim() || "";
    if (raw) {
        const d = new Date(`${raw}T12:00:00`);
        if (!Number.isNaN(d.getTime())) {
            return d.toLocaleDateString("ru-RU");
        }
    }
    return new Date().toLocaleDateString("ru-RU");
}

function buildReceiptDrafts(orders: OrderData[]): ReceiptDraft[] {
    return orders.map((order) => ({
        orderId: order.id,
        printDate: receiptPrintDate(order),
        deliveryLabel: deliveryLabel(order),
        deliveryFee: order.delivery_fee ?? "0.00",
        discountAmount: order.discount_amount ?? "0.00",
        total: order.total,
        items: order.items.map((item) => {
            const country = item.product_country?.trim() ?? "";
            return {
                key: `${order.id}-${item.id}`,
                productId: item.product_id ?? null,
                name: receiptItemDisplayName(item),
                qty: item.qty,
                price: item.price,
                total: item.total,
                country,
                originalCountry: country,
            };
        }),
    }));
}

export default function AdminOrderReceiptsModal({ orders, countryOptions, onCloseAction }: Props) {
    const [drafts, setDrafts] = useState<ReceiptDraft[]>(() => buildReceiptDrafts(orders));
    const [printing, setPrinting] = useState(false);
    const [printError, setPrintError] = useState("");

    useEffect(() => {
        setDrafts(buildReceiptDrafts(orders));
    }, [orders]);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousOverflow;
            document.body.classList.remove("admin-order-receipts-printing");
        };
    }, []);

    const countryList = useMemo(() => {
        const values = new Set(countryOptions.map((country) => country.trim()).filter(Boolean));
        drafts.forEach((draft) => {
            draft.items.forEach((item) => {
                if (item.country) {
                    values.add(item.country);
                }
            });
        });
        return Array.from(values).sort((a, b) => a.localeCompare(b, "ru-RU"));
    }, [countryOptions, drafts]);

    const updateItemCountry = (orderId: number, itemKey: string, country: string) => {
        setDrafts((prev) =>
            prev.map((draft) =>
                draft.orderId === orderId
                    ? {
                        ...draft,
                        items: draft.items.map((item) =>
                            item.key === itemKey ? { ...item, country } : item,
                        ),
                    }
                    : draft,
            ),
        );
    };

    const handlePrint = async () => {
        if (printing) {
            return;
        }

        setPrintError("");
        setPrinting(true);

        try {
            const byProductId = new Map<number, string>();
            drafts.forEach((draft) => {
                draft.items.forEach((item) => {
                    if (item.productId == null) {
                        return;
                    }
                    if (item.country.trim() === item.originalCountry.trim()) {
                        return;
                    }
                    byProductId.set(item.productId, item.country.trim());
                });
            });

            if (byProductId.size > 0) {
                await syncReceiptMadeInCountries(
                    Array.from(byProductId.entries()).map(([product_id, country]) => ({
                        product_id,
                        country: country || null,
                    })),
                );

                setDrafts((prev) =>
                    prev.map((draft) => ({
                        ...draft,
                        items: draft.items.map((item) => ({
                            ...item,
                            originalCountry: item.country,
                        })),
                    })),
                );
            }

            document.body.classList.add("admin-order-receipts-printing");

            const cleanup = () => {
                document.body.classList.remove("admin-order-receipts-printing");
                window.removeEventListener("afterprint", cleanup);
            };

            window.addEventListener("afterprint", cleanup);
            window.print();
        } catch (error) {
            console.error(error);
            setPrintError(
                error instanceof Error
                    ? error.message
                    : "Не удалось сохранить страны товаров",
            );
        } finally {
            setPrinting(false);
        }
    };

    if (typeof document === "undefined") {
        return null;
    }

    return createPortal(
        <>
            <div
                className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/55 p-0 sm:items-center sm:p-4"
                onClick={onCloseAction}
                role="presentation"
            >
                <div
                    className="flex h-[94dvh] w-[calc(100vw-24px)] max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-admin-border bg-admin-surface shadow-2xl sm:h-[min(90vh,760px)] sm:rounded-xl"
                    onClick={(event) => event.stopPropagation()}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="admin-order-receipts-title"
                >
                    <div className="border-b border-admin-border px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 id="admin-order-receipts-title" className="text-lg font-semibold text-admin-text">
                                    Печать товарных чеков
                                </h3>
                                <p className="mt-0.5 text-xs text-admin-text-secondary">
                                    Страна берётся из атрибута «Сделано в». Изменение при печати сохранится в товар.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={onCloseAction}
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-admin-border bg-white text-xl leading-none text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text"
                                aria-label="Закрыть"
                            >
                                x
                            </button>
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                        <div className="overflow-x-auto rounded-xl border border-admin-border">
                            <table className="min-w-full table-fixed text-sm">
                                <thead>
                                    <tr className="border-b bg-admin-muted text-left text-xs font-semibold uppercase tracking-wide text-admin-text-secondary">
                                        <th className="w-28 px-3 py-2">Заказ</th>
                                        <th className="px-3 py-2">Товар</th>
                                        <th className="w-56 px-3 py-2">Страна</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {drafts.map((draft) =>
                                        draft.items.map((item) => (
                                            <tr key={item.key} className="border-b last:border-b-0">
                                                <td className="whitespace-nowrap px-3 py-2 font-medium text-admin-text">
                                                    #{draft.orderId}
                                                </td>
                                                <td className="px-3 py-2 text-admin-text">
                                                    <div className="line-clamp-2">{item.name || "Товар"}</div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <select
                                                        value={item.country}
                                                        onChange={(event) =>
                                                            updateItemCountry(
                                                                draft.orderId,
                                                                item.key,
                                                                event.target.value,
                                                            )
                                                        }
                                                        className="w-48 rounded-lg border border-admin-border bg-white px-2.5 py-1.5 text-sm"
                                                    >
                                                        <option value="">Не указана</option>
                                                        {countryList.map((country) => (
                                                            <option key={country} value={country}>
                                                                {country}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        )),
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 border-t border-admin-border px-4 py-3 sm:flex-row sm:items-center sm:justify-end">
                        {printError ? (
                            <p className="mr-auto text-xs text-red-600">{printError}</p>
                        ) : null}
                        <button
                            type="button"
                            onClick={onCloseAction}
                            disabled={printing}
                            className="rounded-lg border border-admin-border px-4 py-2.5 text-sm transition hover:bg-admin-muted disabled:opacity-60"
                        >
                            Отмена
                        </button>
                        <button
                            type="button"
                            onClick={() => void handlePrint()}
                            disabled={printing}
                            className="rounded-lg bg-admin-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-admin-primary-hover disabled:opacity-60"
                        >
                            {printing ? "Сохранение…" : "Печать"}
                        </button>
                    </div>
                </div>
            </div>

            <div className="admin-order-receipts-print-root">
                {drafts.map((draft) => (
                    <article key={draft.orderId} className="admin-order-receipt-print-card">
                        <div className="admin-order-receipt-header">
                            <div className="admin-order-receipt-logo" aria-label="Perfumer">
                                <div>PERFUMER</div>
                                <span>ORIGINAL PERFUMES</span>
                            </div>
                            <div className="admin-order-receipt-seller">
                                <div className="admin-order-receipt-company">
                                    <span>Продавец:</span> {COMPANY_NAME}
                                </div>
                                <div className="admin-order-receipt-unp">
                                    <span>УНП:</span> {COMPANY_UNP}
                                </div>
                            </div>
                        </div>

                        <div className="admin-order-receipt-title">
                            <span>Товарный чек</span>
                            <span>от {draft.printDate} г.</span>
                        </div>

                        <table className="admin-order-receipt-table">
                            <thead>
                                <tr>
                                    <th>№ п/п</th>
                                    <th>Наименование, характеристика товара</th>
                                    <th>Ед</th>
                                    <th>Кол-во</th>
                                    <th>Цена, руб</th>
                                    <th>Сумма, руб</th>
                                </tr>
                            </thead>
                            <tbody>
                                {draft.items.map((item, index) => (
                                    <tr key={item.key}>
                                        <td>{index + 1}</td>
                                        <td>
                                            {[item.name, item.country].filter(Boolean).join(" - ")}
                                        </td>
                                        <td>шт</td>
                                        <td>{item.qty}</td>
                                        <td>{normalizeMoneyForDisplay(item.price)}</td>
                                        <td>{normalizeMoneyForDisplay(item.total)}</td>
                                    </tr>
                                ))}

                                {moneyToCents(draft.deliveryFee) > 0 ? (
                                    <tr className="admin-order-receipt-summary-row">
                                        <td colSpan={2} className="admin-order-receipt-total-empty" />
                                        <td colSpan={3} className="admin-order-receipt-total-label">
                                            {draft.deliveryLabel}:
                                        </td>
                                        <td className="admin-order-receipt-total-value">
                                            {normalizeMoneyForDisplay(draft.deliveryFee)}
                                        </td>
                                    </tr>
                                ) : null}

                                {moneyToCents(draft.discountAmount) > 0 ? (
                                    <tr className="admin-order-receipt-summary-row">
                                        <td colSpan={2} className="admin-order-receipt-total-empty" />
                                        <td colSpan={3} className="admin-order-receipt-total-label">
                                            Скидка по дисконтной карте:
                                        </td>
                                        <td className="admin-order-receipt-total-value">
                                            −{normalizeMoneyForDisplay(draft.discountAmount)}
                                        </td>
                                    </tr>
                                ) : null}

                                <tr className="admin-order-receipt-total-row">
                                    <td colSpan={2} className="admin-order-receipt-total-empty" />
                                    <td colSpan={3} className="admin-order-receipt-total-label">
                                        ИТОГО:
                                    </td>
                                    <td className="admin-order-receipt-total-value">
                                        {normalizeMoneyForDisplay(draft.total)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        <div className="admin-order-receipt-signature">
                            <span>Продавец</span>
                            <span>подпись</span>
                            <span>ф.и.о.</span>
                        </div>
                    </article>
                ))}
            </div>
        </>,
        document.body,
    );
}

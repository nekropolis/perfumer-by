"use client";

import { useState } from "react";
import Link from "next/link";
import type { OrderGiftCertificatePurchase, OrderItem } from "@/types/orders";
import AdminOrderItemSuppliersModal from "@/components/admin/admin-order-item-suppliers-modal";
import AdminInfoButton from "@/components/admin/ui/admin-info-button";
import CopyText from "@/components/ui/copy-text";
import { lineItemProductTitle } from "@/lib/product-display-name";
import { formatMoneyDisplay } from "@/lib/format-money-display";
import { receiptLineDiscounts } from "@/lib/loyalty-pricing";

type Props = {
    items: OrderItem[];
    certificatePurchases?: OrderGiftCertificatePurchase[];
    /** Процент карты, уже применённый к заказу. 0, если скидки по карте нет. */
    cardDiscountPercent?: number;
};

export default function AdminOrderItemsTable({ items, certificatePurchases, cardDiscountPercent = 0 }: Props) {
    const [activeItem, setActiveItem] = useState<OrderItem | null>(null);

    return (
        <>
            <div className="overflow-x-auto rounded-2xl border">
                <table className="w-full text-sm">
                    <thead className="bg-admin-muted text-xs uppercase tracking-wide text-admin-text-secondary">
                        <tr>
                            <th className="px-3 py-2 text-left">Название</th>
                            <th className="px-3 py-2 text-right">Кол-во</th>
                            <th className="px-3 py-2 text-right">Цена за шт</th>
                            <th className="px-3 py-2 text-right">Итого</th>
                            <th className="px-3 py-2 text-center w-12"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {items.map((item) => {
                            const suppliersCount =
                                (item.supplier_offers?.length ?? 0) +
                                (item.receipt_batches?.length ?? 0);
                            const productTitle = lineItemProductTitle(item) || "Товар";
                            const priced = receiptLineDiscounts(
                                [{
                                    price: item.price,
                                    qty: item.qty,
                                    waiting: item.waiting_discount,
                                }],
                                cardDiscountPercent,
                                null,
                            )[0];
                            const discountLabel = priced?.percentLabel ?? "";

                            return (
                                <tr key={item.id} className="align-top">
                                    <td className="px-3 py-3">
                                        {item.product_id != null ? (
                                            <Link
                                                href={`/admin/products/${item.product_id}/edit`}
                                                className="font-medium underline decoration-gray-300 underline-offset-2 hover:text-admin-text"
                                            >
                                                {productTitle}
                                            </Link>
                                        ) : (
                                            <span className="font-medium">{productTitle}</span>
                                        )}
                                        {item.variant_title && (
                                            <div className="mt-0.5 text-xs text-admin-text-secondary">
                                                {item.variant_id != null ? (
                                                    <Link
                                                        href={`/admin/products/variants/${item.variant_id}/edit`}
                                                        className="underline decoration-gray-300 underline-offset-2 hover:text-admin-text"
                                                    >
                                                        {item.variant_title}
                                                    </Link>
                                                ) : (
                                                    <span>{item.variant_title}</span>
                                                )}
                                            </div>
                                        )}
                                        {discountLabel ? (
                                            <div className="mt-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                                −{discountLabel}%
                                            </div>
                                        ) : null}
                                        {item.sku && (
                                            <div className="mt-0.5 flex items-center gap-1 text-xs text-admin-text-secondary">
                                                <span>SKU:</span>
                                                <CopyText
                                                    value={item.sku}
                                                    title="Скопировать SKU"
                                                    iconSize={12}
                                                />
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-3 py-3 text-right">{item.qty}</td>
                                    <td className="px-3 py-3 text-right tabular-nums">
                                        {discountLabel && priced ? (
                                            <div className="space-y-0.5">
                                                <p className="text-xs text-admin-text-secondary line-through">
                                                    {formatMoneyDisplay(priced.unitPrice)}
                                                </p>
                                                <p className="text-[11px] font-medium text-amber-800">−{discountLabel}%</p>
                                                <p>{formatMoneyDisplay(priced.saleUnit)}</p>
                                            </div>
                                        ) : (
                                            item.price
                                        )}
                                    </td>
                                    <td className="px-3 py-3 text-right font-medium tabular-nums">
                                        {discountLabel && priced ? formatMoneyDisplay(priced.net) : item.total}
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                        <AdminInfoButton
                                            count={suppliersCount}
                                            onClickAction={(e) => {
                                                e.stopPropagation();
                                                setActiveItem(item);
                                            }}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    {certificatePurchases && certificatePurchases.length > 0 ? (
                        <>
                            <tbody>
                                <tr className="bg-violet-50/80">
                                    <td
                                        colSpan={5}
                                        className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-violet-900"
                                    >
                                        Подарочные сертификаты (покупка)
                                    </td>
                                </tr>
                            </tbody>
                            <tbody className="divide-y">
                                {certificatePurchases.map((row) => (
                                    <tr key={row.id} className="align-top bg-violet-50/40">
                                        <td className="px-3 py-3">
                                            <span className="font-medium text-admin-text">{row.template_title}</span>
                                            <div className="mt-0.5 text-xs text-admin-text-secondary">Шаблон #{row.template_id}</div>
                                        </td>
                                        <td className="px-3 py-3 text-right">{row.qty}</td>
                                        <td className="px-3 py-3 text-right">{row.amount}</td>
                                        <td className="px-3 py-3 text-right font-medium">{row.total}</td>
                                        <td className="px-3 py-3 text-center text-xs text-gray-400">—</td>
                                    </tr>
                                ))}
                            </tbody>
                        </>
                    ) : null}
                </table>
            </div>

            {activeItem && (
                <AdminOrderItemSuppliersModal
                    item={activeItem}
                    onCloseAction={() => setActiveItem(null)}
                />
            )}
        </>
    );
}

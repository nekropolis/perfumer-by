"use client";

import { useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import type { OrderItem } from "@/types/orders";
import AdminOrderItemSuppliersModal from "@/components/admin/admin-order-item-suppliers-modal";
import CopyText from "@/components/ui/copy-text";

type Props = {
    items: OrderItem[];
};

export default function AdminOrderItemsTable({ items }: Props) {
    const [activeItem, setActiveItem] = useState<OrderItem | null>(null);

    return (
        <>
            <div className="overflow-x-auto rounded-2xl border">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
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
                            const suppliersCount = item.supplier_offers?.length ?? 0;

                            return (
                                <tr key={item.id} className="align-top">
                                    <td className="px-3 py-3">
                                        {item.product_id != null ? (
                                            <Link
                                                href={`/admin/products/${item.product_id}/edit`}
                                                className="font-medium underline decoration-gray-300 underline-offset-2 hover:text-gray-900"
                                            >
                                                {item.product_name}
                                            </Link>
                                        ) : (
                                            <span className="font-medium">{item.product_name}</span>
                                        )}
                                        {item.variant_title && (
                                            <div className="mt-0.5 text-xs text-gray-600">
                                                {item.variant_id != null ? (
                                                    <Link
                                                        href={`/admin/products/variants/${item.variant_id}/edit`}
                                                        className="underline decoration-gray-300 underline-offset-2 hover:text-gray-900"
                                                    >
                                                        {item.variant_title}
                                                    </Link>
                                                ) : (
                                                    <span>{item.variant_title}</span>
                                                )}
                                            </div>
                                        )}
                                        {item.sku && (
                                            <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
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
                                    <td className="px-3 py-3 text-right">{item.price}</td>
                                    <td className="px-3 py-3 text-right font-medium">
                                        {item.total}
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                console.log("[AdminOrderItemsTable] click i-button", item);
                                                setActiveItem(item);
                                            }}
                                            className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border text-gray-600 transition hover:bg-gray-50"
                                            title="Подробности позиции"
                                            aria-label="Подробности позиции"
                                        >
                                            <Info className="h-4 w-4" />
                                            {suppliersCount > 0 && (
                                                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-gray-900 px-1 text-[10px] font-semibold text-white">
                                                    {suppliersCount}
                                                </span>
                                            )}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
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

import Link from "next/link";
import { lineItemProductTitle } from "@/lib/product-display-name";
import type { OrderItem } from "@/types/orders";

type Props = {
    item: OrderItem;
    linkMode: "admin" | "store";
};

export default function OrderItemCard({ item, linkMode }: Props) {
    const hasCatalog = item.product_id != null || item.variant_id != null;

    const productTitle = lineItemProductTitle(item);

    return (
        <div className="rounded-2xl border p-4">
            <div className="text-lg font-medium">{productTitle}</div>
            <div className="text-sm text-gray-600">{item.variant_title}</div>

            {hasCatalog ? (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                    {item.product_id != null ? (
                        linkMode === "admin" ? (
                            <Link
                                href={`/admin/products/${item.product_id}/edit`}
                                className="underline decoration-gray-400 underline-offset-2 hover:text-gray-900"
                            >
                                Товар #{item.product_id}
                            </Link>
                        ) : item.product_slug ? (
                            <Link
                                href={`/product/${item.product_slug}`}
                                className="underline decoration-gray-400 underline-offset-2 hover:text-gray-900"
                            >
                                Страница в магазине
                            </Link>
                        ) : (
                            <span>Товар · ID {item.product_id}</span>
                        )
                    ) : null}
                    {item.variant_id != null ? (
                        linkMode === "admin" ? (
                            <>
                                {item.product_id != null ? <span className="text-gray-400">·</span> : null}
                                <Link
                                    href={`/admin/products/variants/${item.variant_id}/edit`}
                                    className="underline decoration-gray-400 underline-offset-2 hover:text-gray-900"
                                >
                                    Вариант #{item.variant_id}
                                </Link>
                            </>
                        ) : (
                            <>
                                {item.product_id != null ? <span className="text-gray-400">·</span> : null}
                                <span>Вариант · ID {item.variant_id}</span>
                            </>
                        )
                    ) : null}
                </div>
            ) : (
                <p className="mt-2 text-xs text-gray-500">Нет привязки к каталогу.</p>
            )}

            <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-700">
                <div>SKU: {item.sku || "—"}</div>
                <div>Количество: {item.qty}</div>
                <div>Цена: {item.price} руб.</div>
                <div>Сумма: {item.total} руб.</div>
            </div>
        </div>
    );
}

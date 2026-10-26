"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, startTransition } from "react";
import { fetchMyOrder } from "@/lib/my-orders-api";
import type { OrderData, OrderItem } from "@/types/orders";
import { getOrderStatusColor, getOrderStatusLabel, orderStatusPillStyle } from "@/constants/order-statuses";
import OrderDiscountSummary from "@/components/account/order-discount-summary";
import { normalizeProductImageUrl, productImageLoader } from "@/lib/product-image-url";
import { lineItemProductTitle } from "@/lib/product-display-name";
import { formatMoneyRub } from "@/lib/format-money-display";
import { formatDeliveryAddressLine } from "@/lib/format-delivery-address";
import { apiFetch } from "@/lib/api";
import { addToCart } from "@/lib/cart-api";
import { useCart } from "@/components/cart/cart-provider";
import { siteBtnPrimary } from "@/lib/site-ui-classes";
import type { ProductDetailResponse, ProductVariantData } from "@/types/catalog";

function repeatLineTitle(item: OrderItem): string {
    const title = lineItemProductTitle(item).trim();
    const variant = item.variant_title?.trim();
    return [title, variant].filter(Boolean).join(" — ") || "Товар";
}

function variantCanRepeat(variant: ProductVariantData | undefined, qty: number): boolean {
    if (!variant?.is_available || !variant.price) {
        return false;
    }
    if (variant.available_stock >= qty) {
        return true;
    }
    return variant.is_preorder && variant.available_stock <= 0;
}

type Props = {
    orderId: number | null;
    onCloseOrderAction: () => void;
    embedded?: boolean;
};

export default function OrderModal({ orderId, onCloseOrderAction, embedded = false }: Props) {
    const router = useRouter();
    const { cart, setCartState } = useCart();
    const [order, setOrder] = useState<OrderData | null>(null);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [repeating, setRepeating] = useState(false);
    const [repeatMessage, setRepeatMessage] = useState("");

    useEffect(() => {
        if (!orderId) return;

        startTransition(() => {
            setLoading(true);
            setErrorMessage("");
            setOrder(null);
        });

        fetchMyOrder(orderId)
            .then((response) => {
                setOrder(response.data);
            })
            .catch((error) => {
                console.error(error);
                setErrorMessage("Не удалось загрузить заказ");
            })
            .finally(() => {
                setLoading(false);
            });
    }, [orderId]);

    useEffect(() => {
        setRepeatMessage("");
        setRepeating(false);
    }, [orderId]);

    async function repeatOrder() {
        if (!order || repeating) {
            return;
        }

        const lines = order.items.filter((item) => item.variant_id != null);
        if (lines.length === 0) {
            setRepeatMessage("Повторить нельзя, нет в наличии.");
            return;
        }

        setRepeating(true);
        setRepeatMessage("");

        try {
            const slugs = [...new Set(lines.map((item) => item.product_slug).filter((slug): slug is string => Boolean(slug)))];
            const products = new Map<string, ProductDetailResponse["data"]>();

            await Promise.all(
                slugs.map(async (slug) => {
                    try {
                        const response = await apiFetch<ProductDetailResponse>(
                            `/catalog/products/${encodeURIComponent(slug)}`,
                        );
                        products.set(slug, response.data);
                    } catch {
                        /* товар снят или недоступен */
                    }
                }),
            );

            const blocked: string[] = [];
            const ready: { variantId: number; qty: number }[] = [];

            for (const item of lines) {
                const variantId = item.variant_id;
                const product = item.product_slug ? products.get(item.product_slug) : undefined;
                const variant = product?.variants.find((row) => row.id === variantId);
                const inCart = cart?.items.find((row) => row.product_variant_id === variantId)?.qty ?? 0;
                if (variantId == null || !variantCanRepeat(variant, inCart + item.qty)) {
                    blocked.push(repeatLineTitle(item));
                    continue;
                }
                ready.push({ variantId, qty: item.qty });
            }

            if (blocked.length > 0) {
                setRepeatMessage(`Повторить нельзя, нет в наличии: ${blocked.join(", ")}.`);
                return;
            }

            let lastCart = null;
            for (const row of ready) {
                lastCart = await addToCart(row.variantId, row.qty);
            }
            if (lastCart) {
                setCartState(lastCart.data);
            }
            router.push("/cart");
        } catch {
            setRepeatMessage("Не удалось повторить заказ.");
        } finally {
            setRepeating(false);
        }
    }

    useEffect(() => {
        if (!orderId || embedded) return;

        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onCloseOrderAction();
            }
        };

        document.addEventListener("keydown", handleEsc);
        document.body.style.overflow = "hidden";

        return () => {
            document.removeEventListener("keydown", handleEsc);
            document.body.style.overflow = "";
        };
    }, [embedded, orderId, onCloseOrderAction]);

    if (!orderId) return null;

    const details = (
        <div className={embedded ? "text-left" : "rounded-3xl bg-admin-bg p-6 text-center text-admin-text-secondary"}>
            {loading && <div className="text-admin-text-secondary">Загрузка заказа...</div>}

            {!loading && errorMessage && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorMessage}
                </div>
            )}

            {!loading && order && (
                <div>
                    <div className="mb-6 flex flex-wrap items-center gap-3">
                        <span> Статус заказа: </span>
                        <div
                            className="rounded-full px-3 py-1 text-sm"
                            style={orderStatusPillStyle(
                                getOrderStatusColor(order.status, order.status_color),
                            )}
                        >
                           {getOrderStatusLabel(order.status, order.status_label)}
                        </div>
                    </div>

                    {order.comment && (
                        <div
                            className="mb-6 rounded-2xl border border-admin-border bg-admin-bg p-4">
                            <div className="mb-2 text-sm text-admin-text-secondary">Комментарий</div>
                            <div>{order.comment}</div>
                        </div>
                    )}

                    <div className="mb-6 rounded-2xl border border-admin-border bg-admin-surface p-4 text-left">
                        <dl className="grid gap-2 text-sm sm:grid-cols-2">
                            <div>
                                <dt className="text-admin-text-secondary">Тип</dt>
                                <dd className="mt-0.5 font-medium text-admin-text">
                                    {order.delivery_method_label?.trim() ||
                                        order.delivery_method?.trim() ||
                                        "—"}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-admin-text-secondary">Стоимость доставки</dt>
                                <dd className="mt-0.5 font-medium text-admin-text">
                                    {formatMoneyRub(order.delivery_fee ?? "0")}
                                </dd>
                            </div>
                            <div className="sm:col-span-2">
                                <dt className="text-admin-text-secondary">Адрес</dt>
                                <dd className="mt-0.5 font-medium text-admin-text">
                                    {[
                                        order.delivery_city?.trim(),
                                        formatDeliveryAddressLine({
                                            prefix: order.delivery_street_prefix,
                                            street: order.delivery_address,
                                            house: order.delivery_house,
                                            korpus: order.delivery_korpus,
                                            apartment: order.delivery_apartment,
                                        }),
                                    ]
                                        .filter(Boolean)
                                        .join(", ") || "—"}
                                </dd>
                            </div>
                        </dl>
                    </div>

                    <div className="space-y-4">
                        {order.items.map((item) => {
                            const productTitle = lineItemProductTitle(item);
                            return (
                            <div
                                key={item.id}
                                className="rounded-2xl border border-admin-border bg-admin-surface p-3 sm:p-4"
                            >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="flex min-w-0 items-start gap-3">
                                        {item.image ? (
                                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-admin-bg sm:h-14 sm:w-14">
                                                <Image
                                                    src={normalizeProductImageUrl(item.image)}
                                                    loader={productImageLoader}
                                                    alt={productTitle}
                                                    fill
                                                    sizes="56px"
                                                    className="object-cover"
                                                />
                                            </div>
                                        ) : (
                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-admin-bg text-[10px] font-semibold text-admin-text-secondary sm:h-14 sm:w-14 sm:text-xs">
                                                Товар
                                            </div>
                                        )}

                                        <div className="min-w-0 flex-1 text-left">
                                            {item.product_slug ? (
                                                <Link
                                                    href={`/${item.product_slug}`}
                                                    className="break-words text-sm font-medium leading-snug text-admin-text underline-offset-2 hover:underline sm:text-base"
                                                >
                                                    {productTitle}
                                                    {item.variant_title && (
                                                        <span className="text-admin-text-secondary">
                                                            {" "}— {item.variant_title}
                                                        </span>
                                                    )}
                                                </Link>
                                            ) : (
                                                <div className="break-words text-sm font-medium leading-snug text-admin-text sm:text-base">
                                                    {productTitle}
                                                    {item.variant_title && (
                                                        <span className="text-admin-text-secondary">
                                                            {" "}— {item.variant_title}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            <div className="mt-1 flex flex-col gap-0.5 text-xs leading-relaxed text-admin-text-secondary sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:text-sm">
                                                <span>Код товара: {item.sku || item.id}</span>
                                                <span>Цена: {formatMoneyRub(item.price)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between rounded-xl bg-admin-bg px-3 py-2 text-sm font-medium text-admin-text sm:block sm:bg-transparent sm:p-0 sm:text-right">
                                        <div>Кол-во: {item.qty}</div>
                                        <div className="sm:mt-1">Сумма: {formatMoneyRub(item.total)}</div>
                                    </div>
                                </div>
                            </div>
                            );
                        })}
                        {order.gift_certificate_purchases?.map((row) => (
                            <div
                                key={row.id}
                                className="rounded-2xl border border-admin-primary/20 bg-admin-primary/10 p-4"
                            >
                                <div className="mt-1 text-lg font-medium">
                                    Подарочный сертификат: {row.template_title}
                                </div>
                                <div className="mt-2 text-sm text-admin-text-secondary">
                                    Номинал {formatMoneyRub(row.amount)} × {row.qty} шт. — {formatMoneyRub(row.total)}
                                </div>
                                <div className="mt-2 text-xs text-admin-text-secondary">
                                    Остаток по сертификату уточняйте у менеджера.
                                </div>
                            </div>
                        ))}
                    </div>

                    <OrderDiscountSummary order={order}/>

                    <div className="mt-6 border-t border-admin-border pt-4 text-right">
                        <div className="text-sm text-admin-text-secondary">К оплате</div>
                        <div className="text-2xl font-semibold">{formatMoneyRub(order.total)}</div>
                    </div>

                    {order.items.some((item) => item.variant_id != null) ? (
                        <div className="mt-4 text-left">
                            <button
                                type="button"
                                onClick={() => void repeatOrder()}
                                disabled={repeating}
                                className={`${siteBtnPrimary} w-full sm:w-auto`}
                            >
                                {repeating ? "Проверяем наличие…" : "Повторить заказ"}
                            </button>
                            {repeatMessage ? (
                                <p className="mt-2 text-sm text-red-700">{repeatMessage}</p>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );

    if (embedded) {
        return details;
    }

    return (
        <div
            className="fixed inset-0 z-[250] flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-6"
            onClick={onCloseOrderAction}
        >
            <div
                className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-admin-border bg-admin-surface p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-3 flex items-center justify-between gap-4">
                    <div className="text-admin-text-secondary">
                        {orderId}
                    </div>

                    <button
                        type="button"
                        onClick={onCloseOrderAction}
                        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-admin-bg text-xl"
                    >
                        ×
                    </button>
                </div>

                {details}
            </div>
        </div>
    );
}

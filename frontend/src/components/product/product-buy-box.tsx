"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing } from "lucide-react";
import StockNotificationModal from "@/components/product/stock-notification-modal";
import CallbackRequestTrigger from "@/components/product/callback-request-trigger";
import { siteBtnPrimary, siteBtnSecondary, siteCard } from "@/lib/site-ui-classes";

type Variant = {
    id: number;
    display_name: string;
    type: string | null;
    price: string | null;
    old_price: string | null;
    discount_percent: number | null;
    stock: number;
    is_preorder: boolean;
    is_available: boolean;
};

type Props = {
    selectedVariant: Variant | null;
    isSelectedVariantInCart: boolean;
    isPending: boolean;
    onAddToCartAction: () => void;
    formatPriceAction: (price: string | null) => string;
    productId: number;
    productName: string;
    /** Нет остатка на своём складе; заказ через поставщика — другой текст, чем «В наличии». */
    isProductOutOfStock?: boolean;
    loyaltyCardNumber?: string | null;
    loyaltyPercent?: number;
    loyaltyPrice?: string | null;
};

export default function ProductBuyBox({
    selectedVariant,
    isSelectedVariantInCart,
    isPending,
    onAddToCartAction,
    formatPriceAction,
    productId,
    productName,
    isProductOutOfStock = false,
    loyaltyCardNumber,
    loyaltyPercent = 0,
    loyaltyPrice,
}: Props) {
    const [notifyOpen, setNotifyOpen] = useState(false);
    const hasLoyaltyDiscount = Boolean(loyaltyCardNumber && loyaltyPercent > 0 && loyaltyPrice && selectedVariant?.price);

    const hasVariant = selectedVariant !== null;
    const canAddToCart = hasVariant && selectedVariant.is_available;
    const selectedVariantId = selectedVariant?.id ?? null;
    const selectedVariantTitle = selectedVariant?.display_name ?? null;
    const callbackTriggerNode = (
        <CallbackRequestTrigger
            productId={productId}
            productName={productName}
            variantId={selectedVariantId}
            variantTitle={selectedVariantTitle}
        />
    );
    const renderNotifyButton = (className: string, iconClassName: string) => (
        <button type="button" onClick={() => setNotifyOpen(true)} className={`inline-flex items-center gap-2.5 ${className}`}>
            <BellRing className={iconClassName} aria-hidden />
            <span>Сообщить о появлении</span>
        </button>
    );

    return (
        <div className={`${siteCard} p-5 sm:p-6`}>
            {hasVariant ? (
                <>
                    <div className="mb-2 text-sm text-admin-text-secondary">Выбранный вариант</div>

                    <div className="mb-1 text-2xl font-semibold leading-tight">
                        {selectedVariant.display_name}
                    </div>

                    {selectedVariant.type && (
                        <div className="mb-5 text-sm text-admin-text-secondary">
                            {selectedVariant.type}
                        </div>
                    )}

                    <div className="mb-4 flex flex-wrap items-end gap-2">
                        <div className="text-4xl font-semibold leading-none">
                            {hasLoyaltyDiscount
                                ? formatPriceAction(loyaltyPrice ?? null)
                                : selectedVariant.price
                                    ? formatPriceAction(selectedVariant.price)
                                    : selectedVariant.is_preorder
                                        ? "Предзаказ"
                                        : "Цена уточняется"}
                        </div>

                        {(selectedVariant.old_price || hasLoyaltyDiscount) && (
                            <div className="text-base text-admin-text-secondary line-through">
                                {formatPriceAction(selectedVariant.old_price || selectedVariant.price)}
                            </div>
                        )}
                    </div>

                    {hasLoyaltyDiscount && (
                        <div className="mb-4 text-sm text-green-700">
                            Скидка {loyaltyPercent.toFixed(2)}% по карте {loyaltyCardNumber}
                        </div>
                    )}

                    {selectedVariant.discount_percent && (
                        <div className="mb-4 inline-flex rounded-full bg-admin-muted px-3 py-1 text-sm font-medium text-admin-text">
                            - {selectedVariant.discount_percent}%
                        </div>
                    )}

                    <div className="mb-6">
                        {selectedVariant.is_available ? (
                            selectedVariant.is_preorder ? (
                                <div className="text-sm font-medium text-amber-700">
                                    Доступно под заказ
                                </div>
                            ) : isProductOutOfStock ? (
                                <div className="text-sm font-medium text-sky-800">
                                    Под заказ (у поставщика)
                                </div>
                            ) : (
                                <div className="text-sm font-medium text-green-700">
                                    В наличии
                                </div>
                            )
                        ) : (
                            <div className="text-sm font-medium text-red-700">
                                Нет в наличии
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                        {canAddToCart ? (
                            isSelectedVariantInCart ? (
                                <Link
                                    href="/cart"
                                    className={`${siteBtnSecondary} flex-1 cursor-pointer`}
                                >
                                    <span aria-hidden>✓</span>
                                    <span>В корзине (оформить)</span>
                                </Link>
                            ) : (
                                <button
                                    type="button"
                                    onClick={onAddToCartAction}
                                    disabled={!canAddToCart || isPending}
                                    className={`${siteBtnPrimary} flex-1 px-5 py-3.5 text-base`}
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        className="h-5 w-5"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M2.25 3h1.386c.51 0 .955.343 1.087.836L5.61 7.5m0 0h12.84c.75 0 1.398.52 1.56 1.252l1.038 4.5a1.125 1.125 0 01-1.098 1.373H7.125a1.125 1.125 0 01-1.098-.877L5.61 7.5zM8.25 19.5a.75.75 0 100 1.5.75.75 0 000-1.5zm10.5 0a.75.75 0 100 1.5.75.75 0 000-1.5z"
                                        />
                                    </svg>

                                    <span>{isPending ? "Добавление..." : "Добавить в корзину"}</span>
                                </button>
                            )
                        ) : null}
                    </div>

                    <div className="mt-4 flex justify-center">
                        {callbackTriggerNode}
                    </div>

                    {!canAddToCart && (
                        <div className="mt-3 flex justify-center">
                            {renderNotifyButton(
                                "inline-flex items-center gap-2.5 text-sm text-admin-text-secondary transition hover:text-admin-text",
                                "h-4 w-4",
                            )}
                        </div>
                    )}
                </>
            ) : (
                <>
                    <div className="mb-4 text-xl font-semibold leading-tight text-admin-text">
                        Ожидается поступление
                    </div>
                    <p className="mb-5 text-sm leading-6 text-admin-text-secondary">
                        Оставьте номер телефона — мы Вам сообщим, как только товар появится в продаже,
                        и сразу сориентируем по цене.
                    </p>

                    {renderNotifyButton(
                        `${siteBtnPrimary} w-full px-5 py-3.5 text-base`,
                        "h-5 w-5",
                    )}

                    <div className="mt-4 flex justify-center">
                        {callbackTriggerNode}
                    </div>
                </>
            )}

            <StockNotificationModal
                open={notifyOpen}
                onCloseAction={() => setNotifyOpen(false)}
                productId={productId}
                productName={productName}
                variantId={selectedVariantId}
                variantTitle={selectedVariantTitle}
            />

        </div>
    );
}

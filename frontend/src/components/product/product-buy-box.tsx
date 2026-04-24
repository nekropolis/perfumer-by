"use client";

import { useState } from "react";
import { BellRing, PhoneCall } from "lucide-react";
import StockNotificationModal from "@/components/product/stock-notification-modal";
import CallbackRequestModal from "@/components/product/callback-request-modal";

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
    onAddToCart: () => void;
    formatPrice: (price: string | null) => string;
    productId: number;
    productName: string;
    loyaltyCardNumber?: string | null;
    loyaltyPercent?: number;
    loyaltyPrice?: string | null;
};

export default function ProductBuyBox({
    selectedVariant,
    isSelectedVariantInCart,
    isPending,
    onAddToCart,
    formatPrice,
    productId,
    productName,
    loyaltyCardNumber,
    loyaltyPercent = 0,
    loyaltyPrice,
}: Props) {
    const [notifyOpen, setNotifyOpen] = useState(false);
    const [callbackOpen, setCallbackOpen] = useState(false);

    const hasVariant = selectedVariant !== null;
    const canAddToCart = hasVariant && selectedVariant.is_available;

    return (
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
            {hasVariant ? (
                <>
                    <div className="mb-2 text-sm text-[var(--text-secondary)]">Выбранный вариант</div>

                    <div className="mb-1 text-2xl font-semibold leading-tight">
                        {selectedVariant.display_name}
                    </div>

                    {selectedVariant.type && (
                        <div className="mb-5 text-sm text-[var(--text-secondary)]">
                            {selectedVariant.type}
                        </div>
                    )}

                    <div className="mb-4 flex flex-wrap items-end gap-2">
                        <div className="text-4xl font-semibold leading-none">
                            {loyaltyPrice
                                ? formatPrice(loyaltyPrice)
                                : selectedVariant.price
                                    ? formatPrice(selectedVariant.price)
                                    : selectedVariant.is_preorder
                                        ? "Предзаказ"
                                        : "Цена уточняется"}
                        </div>

                        {(selectedVariant.old_price || (loyaltyPrice && selectedVariant.price)) && (
                            <div className="text-base text-[var(--text-secondary)] line-through">
                                {formatPrice(selectedVariant.old_price || selectedVariant.price)}
                            </div>
                        )}
                    </div>

                    {loyaltyCardNumber && loyaltyPrice && (
                        <div className="mb-4 text-sm text-green-700">
                            Скидка {loyaltyPercent.toFixed(2)}% по карте {loyaltyCardNumber}
                        </div>
                    )}

                    {selectedVariant.discount_percent && (
                        <div className="mb-4 inline-flex rounded-full bg-[var(--accent-soft)] px-3 py-1 text-sm font-medium text-[var(--foreground)]">
                            - {selectedVariant.discount_percent}%
                        </div>
                    )}

                    <div className="mb-6">
                        {selectedVariant.is_available ? (
                            selectedVariant.is_preorder ? (
                                <div className="text-sm font-medium text-amber-700">
                                    Доступно под заказ
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
                                <button
                                    type="button"
                                    disabled
                                    className="inline-flex flex-1 cursor-default items-center justify-center gap-2 rounded-2xl border border-[var(--accent-soft)] bg-[var(--background)] px-5 py-4 text-base font-medium text-[var(--accent)]"
                                >
                                    <span aria-hidden>✓</span>
                                    <span>Товар в корзине</span>
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={onAddToCart}
                                    disabled={!canAddToCart || isPending}
                                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-4 text-base font-medium text-white transition-all duration-150 hover:-translate-y-[1px] hover:opacity-95 active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
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
                        <button
                            type="button"
                            onClick={() => setCallbackOpen(true)}
                            title="Заказать звонок"
                            aria-label="Заказать звонок"
                            style={{ transition: "transform 200ms ease-out" }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = "scale(1.1)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = "scale(1)";
                            }}
                            className="inline-flex items-center gap-1.5 text-sm text-emerald-700"
                        >
                            <PhoneCall className="h-4 w-4" />
                            <span className="underline underline-offset-4 decoration-emerald-300">
                                Заказать звонок
                            </span>
                        </button>
                    </div>

                    {!canAddToCart && (
                        <div className="mt-3 flex justify-center">
                            <button
                                type="button"
                                onClick={() => setNotifyOpen(true)}
                                style={{ transition: "transform 200ms ease-out" }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = "scale(1.1)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = "scale(1)";
                                }}
                                className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)]"
                            >
                                <BellRing className="h-4 w-4" />
                                <span className="underline underline-offset-4 decoration-[var(--line)]">
                                    Сообщить о появлении
                                </span>
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <>
                    <div className="mb-4 text-xl font-semibold leading-tight text-[var(--foreground)]">
                        Ожидается поступление
                    </div>
                    <p className="mb-5 text-sm leading-6 text-[var(--text-secondary)]">
                        Оставьте номер телефона — мы Вам сообщим, как только товар появится в продаже,
                        и сразу сориентируем по цене.
                    </p>

                    <button
                        type="button"
                        onClick={() => setNotifyOpen(true)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-black to-neutral-800 px-5 py-4 text-base font-medium text-white transition-all duration-150 hover:-translate-y-[1px] hover:shadow-md active:translate-y-0 active:scale-[0.99]"
                    >
                        <BellRing className="h-5 w-5" />
                        Сообщить о появлении
                    </button>

                    <button
                        type="button"
                        onClick={() => setCallbackOpen(true)}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--background)] px-5 py-3.5 text-sm font-medium text-[var(--foreground)] transition-all duration-150 hover:-translate-y-[1px] hover:border-[var(--accent-soft)] hover:bg-[var(--surface)] active:translate-y-0 active:scale-[0.99]"
                    >
                        <PhoneCall className="h-4 w-4" />
                        Заказать звонок
                    </button>
                </>
            )}

            <StockNotificationModal
                open={notifyOpen}
                onCloseAction={() => setNotifyOpen(false)}
                productId={productId}
                productName={productName}
                variantId={selectedVariant?.id ?? null}
                variantTitle={selectedVariant?.display_name ?? null}
            />

            <CallbackRequestModal
                open={callbackOpen}
                onCloseAction={() => setCallbackOpen(false)}
                productId={productId}
                productName={productName}
                variantId={selectedVariant?.id ?? null}
                variantTitle={selectedVariant?.display_name ?? null}
            />
        </div>
    );
}

"use client";

import Link from "next/link";
import Image from "next/image";
import { Check, Trash2 } from "lucide-react";
import { lineItemProductTitle } from "@/lib/product-display-name";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import {
    addGiftCertificateTemplateToCart,
    applyDiscountCard,
    applyGiftCertificate,
    clearDiscountCard,
    clearGiftCertificate,
    DiscountCardApplyError,
    fetchGiftCertificateTemplates,
    GiftCertificateApplyError,
    normalizeGiftCertificateCodeInput,
    removeGiftCertificateTemplateCartItem,
    removeCartItem,
    type GiftCertificateTemplatePublic,
    updateGiftCertificateTemplateCartItem,
    updateCartItem,
} from "@/lib/cart-api";
import { CHECKOUT_LINE_SELECTION_STORAGE_KEY, fetchCheckoutQuote, type CheckoutQuote } from "@/lib/checkout-api";
import {
    buildPartialCheckoutSelection,
    discountCardForBreakdownFromQuote,
    giftForBreakdownFromQuote,
    cartItemCustomerLineTotal,
    cartItemCustomerUnitPrice,
    cartItemStrikeUnitPrice,
    listSubtotalForLines,
    merchandisePayFromQuote,
    waitingDiscountAmountForLines,
} from "@/lib/checkout-line-selection";
import { useCart } from "@/components/cart/cart-provider";
import MobileBenefitButtons from "@/components/cart/mobile-benefit-buttons";
import { useAuth } from "@/components/auth/auth-provider";
import CartPricingBreakdown, { CartPricingPayBar } from "@/components/cart/cart-pricing-breakdown";
import SiteConfirmDialog from "@/components/ui/site-confirm-dialog";
import { withBynSignReplacingCode, withBynSignReplacingCodeText } from "@/lib/byn-sign";
import { parseMoneyMinorUnits } from "@/lib/format-byn";
import { formatMoneyRub } from "@/lib/format-money-display";
import { normalizeProductImageUrl, productImageLoader } from "@/lib/product-image-url";
import { siteBtnPrimary, siteBtnSecondary, siteCard, siteInput } from "@/lib/site-ui-classes";
import type { CartItemData } from "@/types/cart";

type PendingDelete =
    | { type: "product"; id: number; title: string }
    | { type: "gift"; id: number; title: string }
    | null;

function sumMoneyStrings(values: string[]): string {
    let cents = 0;
    for (const raw of values) {
        const normalized = String(raw ?? "")
            .trim()
            .replace(",", ".")
            .replace(/\s/g, "");
        const n = Number.parseFloat(normalized);
        if (!Number.isFinite(n)) continue;
        cents += Math.round(n * 100);
    }
    if (cents < 0) cents = 0;
    const int = Math.floor(cents / 100);
    const frac = cents % 100;
    return `${int}.${frac.toString().padStart(2, "0")}`;
}

type CartLineSelectControlProps = {
    checked: boolean;
    onToggle: () => void;
    ariaLabel: string;
};

/** Ширина красной зоны удаления — свайп не должен уходить дальше неё. */
const DELETE_ACTION_WIDTH_PX = 72;
const DELETE_SWIPE_TRIGGER_PX = 48;

function SwipeToDelete({
    children,
    disabled,
    onDelete,
}: {
    children: ReactNode;
    disabled?: boolean;
    onDelete: () => void;
}) {
    const [offset, setOffset] = useState(0);
    const [dragging, setDragging] = useState(false);
    const gesture = useRef<{ x: number; y: number; locked: boolean | null; pointerId: number } | null>(null);
    const offsetRef = useRef(0);
    const suppressClick = useRef(false);

    const setOffsetBoth = (value: number) => {
        offsetRef.current = value;
        setOffset(value);
    };

    return (
        <div className={`relative md:overflow-visible ${offset === 0 ? "overflow-visible" : "overflow-hidden"}`}>
            {offset !== 0 ? (
                <div
                    className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-600 text-white md:hidden"
                    style={{ width: DELETE_ACTION_WIDTH_PX }}
                    aria-hidden
                >
                    <Trash2 className="h-5 w-5" />
                </div>
            ) : null}
            <div
                className={dragging ? "relative bg-admin-surface max-md:pr-4" : "relative bg-admin-surface max-md:pr-4 transition-transform duration-200 ease-out"}
                style={{ transform: offset === 0 ? undefined : `translateX(${offset}px)`, touchAction: "pan-y" }}
                onClickCapture={(event) => {
                    if (!suppressClick.current) {
                        return;
                    }
                    suppressClick.current = false;
                    event.preventDefault();
                    event.stopPropagation();
                }}
                onTouchStart={(event) => {
                    if (disabled) {
                        return;
                    }
                    const target = event.target as HTMLElement | null;
                    if (target?.closest("button, input, label, textarea, select")) {
                        return;
                    }
                    const touch = event.changedTouches[0];
                    if (!touch) {
                        return;
                    }
                    gesture.current = { x: touch.clientX, y: touch.clientY, locked: null, pointerId: touch.identifier };
                }}
                onTouchMove={(event) => {
                    const current = gesture.current;
                    if (!current) {
                        return;
                    }
                    const touch = Array.from(event.changedTouches).find((item) => item.identifier === current.pointerId);
                    if (!touch) {
                        return;
                    }
                    const dx = touch.clientX - current.x;
                    const dy = touch.clientY - current.y;
                    if (current.locked === null) {
                        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
                            return;
                        }
                        current.locked = Math.abs(dx) > Math.abs(dy);
                        if (!current.locked) {
                            gesture.current = null;
                            return;
                        }
                        setDragging(true);
                    }
                    const next = Math.min(0, Math.max(dx, -DELETE_ACTION_WIDTH_PX));
                    setOffsetBoth(next);
                }}
                onTouchEnd={() => {
                    const current = gesture.current;
                    gesture.current = null;
                    setDragging(false);
                    if (current?.locked && offsetRef.current <= -DELETE_SWIPE_TRIGGER_PX && !disabled) {
                        suppressClick.current = true;
                        onDelete();
                    }
                    setOffsetBoth(0);
                }}
                onTouchCancel={() => {
                    gesture.current = null;
                    setDragging(false);
                    setOffsetBoth(0);
                }}
            >
                {children}
            </div>
        </div>
    );
}

function cartVariantCaption(item: CartItemData): string | null {
    const variant = item.variant;
    if (!variant) {
        return null;
    }
    const parts: string[] = [];
    if (variant.volume != null) {
        const unit = variant.volume_unit?.trim() || "мл";
        const vol = Number.isInteger(variant.volume)
            ? String(variant.volume)
            : String(variant.volume).replace(".", ",");
        parts.push(`${vol} ${unit}`);
    }
    const kind = variant.type?.trim()
        || (variant.concentration?.trim() ? variant.concentration.trim().toUpperCase() : "");
    if (kind) {
        parts.push(kind);
    }
    if (parts.length > 0) {
        return parts.join(" · ");
    }
    return variant.display_name || variant.title || null;
}

function cartPricePercent(current: string, previous: string | null): number | null {
    if (!previous) {
        return null;
    }
    const currentMinor = parseMoneyMinorUnits(current);
    const previousMinor = parseMoneyMinorUnits(previous);
    if (previousMinor <= 0 || currentMinor >= previousMinor) {
        return null;
    }
    const pct = Math.round(((previousMinor - currentMinor) * 100) / previousMinor);
    return pct > 0 ? pct : null;
}

function cartProductName(item: CartItemData): string {
    const brand = item.brand_name?.trim() ?? "";
    const name = (item.product_name ?? item.product_display_name ?? "").trim();
    if (!brand || !name) {
        return name || lineItemProductTitle(item);
    }
    const lowerName = name.toLocaleLowerCase("ru");
    const lowerBrand = brand.toLocaleLowerCase("ru");
    if (lowerName === lowerBrand) {
        return name;
    }
    if (lowerName.startsWith(`${lowerBrand} `)) {
        return name.slice(brand.length).trim();
    }
    return name;
}

function shortPercentLabel(raw: string): string {
    const trimmed = raw.trim().replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
        return raw.trim();
    }
    const [whole, frac = ""] = trimmed.split(".");
    const fracTrim = frac.replace(/0+$/, "");
    return fracTrim ? `${whole},${fracTrim}` : whole;
}

function CartLineSelectControl({ checked, onToggle, ariaLabel }: CartLineSelectControlProps) {
    return (
        <label className="relative flex h-5 w-5 shrink-0 cursor-pointer select-none items-center justify-center self-start pt-0.5">
            <input type="checkbox" checked={checked} onChange={() => onToggle()} className="peer sr-only" aria-label={ariaLabel} />
            <span
                aria-hidden
                className={[
                    "pointer-events-none flex h-5 w-5 items-center justify-center rounded-md border-2 bg-admin-surface shadow-sm transition-all duration-200 ease-out",
                    "border-admin-border",
                    "peer-hover:border-admin-border-strong peer-hover:shadow-md",
                    "peer-focus-visible:ring-2 peer-focus-visible:ring-admin-primary/20 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-admin-surface",
                    "peer-checked:border-admin-primary peer-checked:bg-admin-primary peer-checked:shadow-sm",
                    "peer-checked:[&>svg]:scale-100 peer-checked:[&>svg]:opacity-100",
                    "[&>svg]:scale-90 [&>svg]:opacity-0",
                ].join(" ")}
            >
                <svg viewBox="0 0 12 10" fill="none" className="h-2.5 w-2.5 text-white transition-[opacity,transform] duration-200 ease-out" aria-hidden>
                    <path
                        d="M1 5l3.5 3.5L11 1.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </span>
        </label>
    );
}

export default function CartPage() {
    const { cart, loading, setCartState } = useCart();
    const { isAuthenticated } = useAuth();
    const [isPending, startTransition] = useTransition();
    const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
    const [confirmClearCart, setConfirmClearCart] = useState(false);
    const [giftCertificateCode, setGiftCertificateCode] = useState("");
    const [giftCertificateHoneypot, setGiftCertificateHoneypot] = useState("");
    const [giftCertificateLastAttemptAt, setGiftCertificateLastAttemptAt] = useState(0);
    const [discountCardNumber, setDiscountCardNumber] = useState("");
    const [discountCardConflict, setDiscountCardConflict] = useState<string | null>(null);
    const [discountCardApplyError, setDiscountCardApplyError] = useState("");
    const [giftCertificateApplyError, setGiftCertificateApplyError] = useState("");
    const [templates, setTemplates] = useState<GiftCertificateTemplatePublic[]>([]);
    const [giftCertQuickAddOpen, setGiftCertQuickAddOpen] = useState(false);

    const cartLineKey = useMemo(() => {
        if (!cart) return "";
        const p = cart.items.map((i) => i.id).join(",");
        const g = (cart.gift_certificate_items ?? []).map((i) => i.id).join(",");
        return `${p}|${g}`;
    }, [cart]);

    const [selectedCartItemIds, setSelectedCartItemIds] = useState<Set<number>>(() => new Set());
    const [selectedGiftLineIds, setSelectedGiftLineIds] = useState<Set<number>>(() => new Set());

    useEffect(() => {
        if (!cart || cartLineKey === "") return;
        queueMicrotask(() => {
            setSelectedCartItemIds(new Set(cart.items.map((i) => i.id)));
            setSelectedGiftLineIds(new Set((cart.gift_certificate_items ?? []).map((i) => i.id)));
        });
    }, [cart, cartLineKey]);

    const toggleCartItemSelected = useCallback((itemId: number) => {
        setSelectedCartItemIds((prev) => {
            const next = new Set(prev);
            if (next.has(itemId)) next.delete(itemId);
            else next.add(itemId);
            return next;
        });
    }, []);

    const toggleGiftLineSelected = useCallback((lineId: number) => {
        setSelectedGiftLineIds((prev) => {
            const next = new Set(prev);
            if (next.has(lineId)) next.delete(lineId);
            else next.add(lineId);
            return next;
        });
    }, []);

    const persistCheckoutSelection = useCallback(() => {
        if (!cart) return;
        const allProductsSelected = cart.items.every((i) => selectedCartItemIds.has(i.id));
        const gifts = cart.gift_certificate_items ?? [];
        const allGiftsSelected = gifts.length === 0 || gifts.every((i) => selectedGiftLineIds.has(i.id));
        if (allProductsSelected && allGiftsSelected) {
            sessionStorage.removeItem(CHECKOUT_LINE_SELECTION_STORAGE_KEY);
            return;
        }
        sessionStorage.setItem(
            CHECKOUT_LINE_SELECTION_STORAGE_KEY,
            JSON.stringify({
                cart_item_ids: cart.items.filter((i) => selectedCartItemIds.has(i.id)).map((i) => i.id),
                gift_certificate_cart_item_ids: gifts.filter((i) => selectedGiftLineIds.has(i.id)).map((i) => i.id),
            }),
        );
    }, [cart, selectedCartItemIds, selectedGiftLineIds]);

    const hasCheckoutSelection = Boolean(
        cart &&
            (cart.items.some((i) => selectedCartItemIds.has(i.id)) ||
                (cart.gift_certificate_items ?? []).some((i) => selectedGiftLineIds.has(i.id))),
    );

    const partialLineSelection = Boolean(
        cart &&
            (cart.items.some((i) => !selectedCartItemIds.has(i.id)) ||
                (cart.gift_certificate_items ?? []).some((i) => !selectedGiftLineIds.has(i.id))),
    );

    const selectedLinesSubtotalStr = useMemo(() => {
        if (!cart) return "0.00";
        const totals: string[] = [];
        for (const item of cart.items) {
            if (selectedCartItemIds.has(item.id)) totals.push(item.total);
        }
        for (const row of cart.gift_certificate_items ?? []) {
            if (selectedGiftLineIds.has(row.id)) totals.push(row.total);
        }
        return sumMoneyStrings(totals);
    }, [cart, selectedCartItemIds, selectedGiftLineIds]);

    const selectedLinesListSubtotalStr = useMemo(() => {
        if (!cart) return "0.00";
        return listSubtotalForLines(
            cart.items.filter((item) => selectedCartItemIds.has(item.id)),
            (cart.gift_certificate_items ?? []).filter((row) => selectedGiftLineIds.has(row.id)),
        );
    }, [cart, selectedCartItemIds, selectedGiftLineIds]);

    const selectedLinesQty = useMemo(() => {
        if (!cart) return 0;
        let n = 0;
        for (const item of cart.items) {
            if (selectedCartItemIds.has(item.id)) n += item.qty;
        }
        for (const row of cart.gift_certificate_items ?? []) {
            if (selectedGiftLineIds.has(row.id)) n += row.qty;
        }
        return n;
    }, [cart, selectedCartItemIds, selectedGiftLineIds]);

    const selectedWaitingDiscountAmount = useMemo(() => {
        if (!cart) return "0.00";
        const selectedItems = cart.items.filter((item) => selectedCartItemIds.has(item.id));
        return waitingDiscountAmountForLines(selectedItems);
    }, [cart, selectedCartItemIds]);

    const partialCheckoutSelection = useMemo(() => {
        if (!cart || !partialLineSelection) {
            return null;
        }
        return buildPartialCheckoutSelection(cart, selectedCartItemIds, selectedGiftLineIds);
    }, [cart, partialLineSelection, selectedCartItemIds, selectedGiftLineIds]);

    const [partialQuote, setPartialQuote] = useState<CheckoutQuote | null>(null);

    useEffect(() => {
        if (!cart?.token || !partialCheckoutSelection) {
            queueMicrotask(() => {
                setPartialQuote(null);
            });
            return;
        }
        let cancelled = false;
        void fetchCheckoutQuote({
            payment_method: "cash",
            delivery_method: "minsk_courier",
            cart_item_ids: partialCheckoutSelection.cart_item_ids,
            gift_certificate_cart_item_ids: partialCheckoutSelection.gift_certificate_cart_item_ids,
        })
            .then((response) => {
                if (!cancelled) {
                    setPartialQuote(response.data);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setPartialQuote(null);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [cart?.token, partialCheckoutSelection]);

    const pricingBreakdown = useMemo(() => {
        if (!cart) {
            return {
                itemsQty: 0,
                subtotal: "0.00",
                total: "0.00",
                discountCard: null as ReturnType<typeof discountCardForBreakdownFromQuote>,
                giftCertificate: null as ReturnType<typeof giftForBreakdownFromQuote>,
            };
        }
        if (!partialLineSelection) {
            return {
                itemsQty: cart.qty,
                subtotal: listSubtotalForLines(cart.items, cart.gift_certificate_items ?? []),
                total: cart.total ?? cart.subtotal,
                discountCard: cart.discount_card ?? null,
                giftCertificate: cart.gift_certificate ?? null,
            };
        }
        if (partialQuote) {
            return {
                itemsQty: selectedLinesQty,
                subtotal: selectedLinesListSubtotalStr,
                total: merchandisePayFromQuote(partialQuote),
                discountCard: discountCardForBreakdownFromQuote(cart, partialQuote),
                giftCertificate: giftForBreakdownFromQuote(cart, partialQuote),
            };
        }
        return {
            itemsQty: selectedLinesQty,
            subtotal: selectedLinesListSubtotalStr,
            total: selectedLinesSubtotalStr,
            discountCard: cart.discount_card ?? null,
            giftCertificate: cart.gift_certificate ?? null,
        };
    }, [
        cart,
        partialLineSelection,
        partialQuote,
        selectedLinesQty,
        selectedLinesListSubtotalStr,
        selectedLinesSubtotalStr,
    ]);

    const checkoutTotalStr = partialLineSelection
        ? partialQuote
            ? merchandisePayFromQuote(partialQuote)
            : selectedLinesSubtotalStr
        : (cart?.total ?? cart?.subtotal ?? "0.00");

    const cardInCart = cart?.discount_card ?? null;
    const canRemoveDiscountCard = Boolean(cardInCart);

    const changeQty = (itemId: number, qty: number) => {
        if (qty < 1) return;

        startTransition(async () => {
            const response = await updateCartItem(itemId, qty);
            setCartState(response.data);
        });
    };

    const deleteItem = (itemId: number) => {
        startTransition(async () => {
            const response = await removeCartItem(itemId);
            setCartState(response.data);
            setPendingDelete(null);
        });
    };

    const requestDeleteProduct = (itemId: number, title: string) => {
        setPendingDelete({ type: "product", id: itemId, title });
    };

    const requestDeleteGift = (itemId: number, title: string) => {
        setPendingDelete({ type: "gift", id: itemId, title });
    };

    const confirmPendingDelete = () => {
        if (!pendingDelete) {
            return;
        }
        if (pendingDelete.type === "product") {
            deleteItem(pendingDelete.id);
            return;
        }
        startTransition(async () => {
            const response = await removeGiftCertificateTemplateCartItem(pendingDelete.id);
            setCartState(response.data);
            setPendingDelete(null);
        });
    };

    const clearWholeCart = () => {
        if (!cart) {
            return;
        }
        const productIds = cart.items.map((item) => item.id);
        const giftIds = (cart.gift_certificate_items ?? []).map((item) => item.id);
        startTransition(async () => {
            let latest = cart;
            for (const id of productIds) {
                latest = (await removeCartItem(id)).data;
            }
            for (const id of giftIds) {
                latest = (await removeGiftCertificateTemplateCartItem(id)).data;
            }
            setCartState(latest);
            setConfirmClearCart(false);
        });
    };

    const changeGiftTemplateQty = (itemId: number, qty: number) => {
        if (qty < 1) return;
        startTransition(async () => {
            const response = await updateGiftCertificateTemplateCartItem(itemId, qty);
            setCartState(response.data);
        });
    };

    const deleteGiftTemplateItem = (itemId: number, title: string) => {
        requestDeleteGift(itemId, title);
    };

    const mobileCheckoutBarRef = useRef<HTMLDivElement | null>(null);
    const hasMobileCheckoutBar = Boolean(
        cart && (cart.items.length > 0 || (cart.gift_certificate_items?.length ?? 0) > 0),
    );

    useEffect(() => {
        void fetchGiftCertificateTemplates()
            .then((res) => setTemplates(res.data))
            .catch(() => setTemplates([]));
    }, []);

    useEffect(() => {
        const root = document.documentElement;
        const bar = mobileCheckoutBarRef.current;
        if (!hasMobileCheckoutBar || !bar) {
            root.style.removeProperty("--storefront-bottom-bar-height");
            return;
        }

        const publishHeight = () => {
            // Не раздуваем padding страницы, пока бар поднят над клавиатурой.
            if (root.dataset.storefrontKeyboardDock === "1") {
                return;
            }
            const height = Math.ceil(bar.getBoundingClientRect().height);
            if (height > 0) {
                root.style.setProperty("--storefront-bottom-bar-height", `${height}px`);
                return;
            }
            root.style.removeProperty("--storefront-bottom-bar-height");
        };

        publishHeight();
        const observer = new ResizeObserver(publishHeight);
        observer.observe(bar);
        const onKeyboardMode = () => publishHeight();
        document.addEventListener("focusin", onKeyboardMode);
        document.addEventListener("focusout", onKeyboardMode);
        return () => {
            observer.disconnect();
            document.removeEventListener("focusin", onKeyboardMode);
            document.removeEventListener("focusout", onKeyboardMode);
            root.style.removeProperty("--storefront-bottom-bar-height");
        };
    }, [hasMobileCheckoutBar]);

    if (loading) {
        return (
            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <div className="text-sm text-admin-text-secondary">Загрузка корзины...</div>
            </main>
        );
    }

    if (!cart || (cart.items.length === 0 && (cart.gift_certificate_items?.length ?? 0) === 0)) {
        return (
            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <div className="mb-6 hidden md:block">
                    <h1 className="text-3xl font-semibold md:text-4xl">Корзина</h1>
                </div>

                <div className={`${siteCard} px-6 py-10 text-center sm:px-8`}>
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-admin-muted text-admin-text-secondary">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            className="h-7 w-7"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M2.25 3h1.386c.51 0 .955.343 1.087.836L5.61 7.5m0 0h12.84c.75 0 1.398.52 1.56 1.252l1.038 4.5a1.125 1.125 0 01-1.098 1.373H7.125a1.125 1.125 0 01-1.098-.877L5.61 7.5zM8.25 19.5a.75.75 0 100 1.5.75.75 0 000-1.5zm10.5 0a.75.75 0 100 1.5.75.75 0 000-1.5z"
                            />
                        </svg>
                    </div>

                    <div className="mb-2 text-2xl font-semibold">Корзина пуста</div>
                    <p className="mx-auto mb-6 max-w-md text-sm leading-6 text-admin-text-secondary">
                        Добавьте товары в корзину, чтобы оформить заказ и сохранить выбранные ароматы.
                    </p>

                    <Link href="/catalog" className={siteBtnPrimary}>
                        Перейти в каталог
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-7xl px-4 py-4 pb-8 sm:px-6 md:py-8 lg:px-8">
            <div className="mb-4 flex flex-col gap-3 md:mb-8 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="hidden text-3xl font-semibold md:block md:text-4xl">Корзина</h1>
                    <p className="hidden text-sm text-admin-text-secondary md:mt-2 md:block">
                        {cart.qty} {cart.qty === 1 ? "товар" : cart.qty < 5 ? "товара" : "товаров"} в корзине
                        {partialLineSelection ? (
                            <>
                                {" "}
                                · к оформлению: {selectedLinesQty}{" "}
                                {selectedLinesQty === 1 ? "позиция" : selectedLinesQty < 5 ? "позиции" : "позиций"}
                            </>
                        ) : null}
                    </p>
                </div>

                <div className="hidden md:block">
                    <Link href="/catalog" className={siteBtnSecondary}>
                        Продолжить покупки
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="space-y-4">
                    {cart.gift_certificate_items?.map((item) => (
                        <SwipeToDelete
                            key={`gift-template-${item.id}`}
                            disabled={isPending}
                            onDelete={() => deleteGiftTemplateItem(item.id, item.title)}
                        >
                        <article
                            className={`${siteCard} p-4 sm:p-5`}
                        >
                            <div className="flex gap-3 sm:gap-4">
                                <CartLineSelectControl
                                    checked={selectedGiftLineIds.has(item.id)}
                                    onToggle={() => toggleGiftLineSelected(item.id)}
                                    ariaLabel="Включить подарочный сертификат в оформление заказа"
                                />
                                <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 flex-1">
                                    <div className="mb-1 text-xs uppercase tracking-wide text-[var(--text-secondary)]">Сертификат</div>
                                    <div className="block text-lg font-medium leading-6 text-[var(--foreground)]">
                                        {withBynSignReplacingCode(item.title)}
                                    </div>
                                    <div className="mt-3 text-sm font-medium text-[var(--foreground)]">{formatMoneyRub(item.amount)}</div>
                                </div>
                                <div className="flex w-full items-center gap-2 sm:w-auto">
                                    <div className="flex items-center rounded-2xl border border-[var(--line)] bg-[var(--background)]">
                                        <button
                                            type="button"
                                            onClick={() => changeGiftTemplateQty(item.id, item.qty - 1)}
                                            disabled={isPending || item.qty <= 1}
                                            aria-label="Уменьшить количество"
                                            className="inline-flex h-10 w-10 items-center justify-center rounded-l-2xl text-base disabled:opacity-40"
                                        >
                                            −
                                        </button>
                                        <span
                                            aria-live="polite"
                                            aria-atomic="true"
                                            className="inline-flex min-w-[36px] items-center justify-center text-sm font-medium"
                                        >
                                            {item.qty}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => changeGiftTemplateQty(item.id, item.qty + 1)}
                                            disabled={isPending}
                                            aria-label="Увеличить количество"
                                            className="inline-flex h-10 w-10 items-center justify-center rounded-r-2xl text-base disabled:opacity-40"
                                        >
                                            +
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => deleteGiftTemplateItem(item.id, item.title)}
                                        disabled={isPending}
                                        aria-label="Удалить"
                                        className="inline-flex h-10 w-10 items-center justify-center rounded-2xl text-[var(--text-secondary)] transition hover:text-[var(--foreground)] disabled:opacity-40"
                                    >
                                        <Trash2 className="h-5 w-5" aria-hidden />
                                    </button>
                                    <div className="ml-auto text-right text-xl font-semibold text-[var(--foreground)] sm:ml-4">
                                        {formatMoneyRub(item.total)}
                                    </div>
                                </div>
                            </div>
                                </div>
                            </div>
                        </article>
                        </SwipeToDelete>
                    ))}

                    <div className={`${siteCard} p-4`}>
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h2 className="text-lg font-semibold text-admin-text">Корзина ({cart.qty})</h2>
                            <button
                                type="button"
                                onClick={() => setConfirmClearCart(true)}
                                disabled={isPending || (cart.items.length === 0 && (cart.gift_certificate_items ?? []).length === 0)}
                                className="inline-flex items-center gap-1.5 text-sm text-admin-text-secondary transition hover:text-admin-text disabled:opacity-40"
                            >
                                <Trash2 className="h-4 w-4" aria-hidden />
                                Очистить
                            </button>
                        </div>
                        <div className="space-y-5">
                    {cart.items.map((item) => {
                        const loyaltyPercent = Number(cart.discount_card?.discount_percent ?? 0) || 0;
                        const unitPrice = cartItemCustomerUnitPrice(item, loyaltyPercent);
                        const strikePrice = cartItemStrikeUnitPrice(item, loyaltyPercent);
                        const title = lineItemProductTitle(item);
                        const productName = cartProductName(item);
                        const caption = cartVariantCaption(item);
                        const image = item.image ? normalizeProductImageUrl(item.image) : "";
                        const productHref = item.product_slug ? `/${item.product_slug}` : null;
                        const percent = cartPricePercent(unitPrice, strikePrice);
                        const selected = selectedCartItemIds.has(item.id);
                        const cardPercent = cart.discount_card?.discount_percent
                            ? shortPercentLabel(cart.discount_card.discount_percent)
                            : "";
                        return (
                        <SwipeToDelete
                            key={item.id}
                            disabled={isPending}
                            onDelete={() => requestDeleteProduct(item.id, title)}
                        >
                        <article>
                            <div className="relative flex items-start gap-3">
                                <button
                                    type="button"
                                    onClick={() => toggleCartItemSelected(item.id)}
                                    aria-pressed={selected}
                                    aria-label="Включить товар в оформление заказа"
                                    className={`absolute -left-1 top-0 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white shadow-sm ${selected ? "bg-admin-primary text-white" : "bg-white/90 text-transparent"}`}
                                >
                                    <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                                </button>
                                <div className="relative h-[5.5rem] w-[5.5rem] shrink-0 overflow-hidden rounded-2xl">
                                    {image ? (
                                        productHref ? (
                                            <Link href={productHref} className="absolute inset-0">
                                                <Image
                                                    src={image}
                                                    loader={productImageLoader}
                                                    alt=""
                                                    fill
                                                    sizes="88px"
                                                    className="object-contain"
                                                />
                                            </Link>
                                        ) : (
                                            <Image
                                                src={image}
                                                loader={productImageLoader}
                                                alt=""
                                                fill
                                                sizes="88px"
                                                className="object-contain"
                                            />
                                        )
                                    ) : null}
                                </div>
                                <div className="min-w-0 flex-1">
                                    {item.brand_name ? (
                                        <div className="text-xs text-admin-text-secondary">{item.brand_name}</div>
                                    ) : null}
                                    {productHref ? (
                                        <Link href={productHref} className="block text-sm font-semibold leading-snug text-admin-text transition hover:opacity-80">
                                            {productName}
                                        </Link>
                                    ) : (
                                        <div className="text-sm font-semibold leading-snug text-admin-text">{productName}</div>
                                    )}
                                    {caption ? (
                                        <p className="mt-0.5 text-xs text-admin-text-secondary">{caption}</p>
                                    ) : null}
                                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className="text-sm font-bold tabular-nums text-admin-text">{formatMoneyRub(unitPrice)}</span>
                                        {strikePrice ? (
                                            <span className="text-xs text-admin-text-secondary line-through tabular-nums">
                                                {formatMoneyRub(strikePrice)}
                                            </span>
                                        ) : null}
                                        {percent ? (
                                            <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-amber-700">
                                                -{percent}%
                                            </span>
                                        ) : null}
                                    </div>
                                    {loyaltyPercent > 0 && cardPercent ? (
                                        <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                            <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                                            Скидка {cardPercent}% по карте
                                        </div>
                                    ) : null}
                                    {!item.is_available ? (
                                        <p className="mt-1 text-xs text-red-600">Нет в наличии</p>
                                    ) : item.waiting_discount ? (
                                        <span className="mt-1.5 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                            Отправка с {cart.waiting_discount_delivery_date || "xx.xx.xxxx"}
                                        </span>
                                    ) : item.is_preorder ? (
                                        <p className="mt-1 text-xs text-amber-600">Под заказ</p>
                                    ) : null}
                                    <div className="mt-2 flex items-center gap-2">
                                        <div className="flex items-center rounded-full border border-[var(--line)] bg-[var(--background)]">
                                            <button
                                                type="button"
                                                onClick={() => changeQty(item.id, item.qty - 1)}
                                                disabled={isPending || item.qty <= 1}
                                                aria-label="Уменьшить количество"
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-l-full text-base text-[var(--foreground)] transition hover:bg-[var(--surface)] disabled:opacity-40"
                                            >
                                                −
                                            </button>
                                            <span
                                                aria-live="polite"
                                                aria-atomic="true"
                                                className="inline-flex min-w-6 items-center justify-center text-sm font-medium"
                                            >
                                                {item.qty}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => changeQty(item.id, item.qty + 1)}
                                                disabled={isPending}
                                                aria-label="Увеличить количество"
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-r-full text-base text-[var(--foreground)] transition hover:bg-[var(--surface)] disabled:opacity-40"
                                            >
                                                +
                                            </button>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => requestDeleteProduct(item.id, title)}
                                            disabled={isPending}
                                            aria-label="Удалить"
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:text-[var(--foreground)] disabled:opacity-40"
                                        >
                                            <Trash2 className="h-4 w-4" aria-hidden />
                                        </button>
                                        <div className="ml-auto text-sm font-semibold tabular-nums text-admin-text">
                                            {formatMoneyRub(cartItemCustomerLineTotal(item, loyaltyPercent))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </article>
                        </SwipeToDelete>
                        );
                    })}
                        </div>
                    </div>

                    <div className="md:hidden">
                        <MobileBenefitButtons variant="block" />
                    </div>

                    <button
                        type="button"
                        onClick={() => setGiftCertQuickAddOpen((o) => !o)}
                        aria-expanded={giftCertQuickAddOpen}
                        className="text-left text-sm font-medium text-[var(--foreground)] underline decoration-dashed underline-offset-[3px] hover:opacity-80 active:opacity-70"
                    >
                        Преобрести подарочный сертификат
                    </button>

                    {giftCertQuickAddOpen ? (
                        <article className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm sm:p-5">

                            <div className="mt-3 flex flex-wrap gap-2">
                                {templates.map((template) => (
                                    <button
                                        key={template.id}
                                        type="button"
                                        disabled={isPending}
                                        onClick={() =>
                                            startTransition(async () => {
                                                const response = await addGiftCertificateTemplateToCart(template.id, 1);
                                                setCartState(response.data);
                                            })
                                        }
                                        className="min-h-10 rounded-2xl border border-[var(--line)] px-3 py-2 text-xs"
                                    >
                                        {formatMoneyRub(template.amount)}
                                    </button>
                                ))}
                                <Link
                                    href="/gift-certificates"
                                    className="inline-flex min-h-10 items-center rounded-2xl border border-[var(--line)] px-3 py-2 text-xs"
                                >
                                    Все сертификаты
                                </Link>
                            </div>
                        </article>
                    ) : null}

                    <div className={`${siteCard} p-4 xl:hidden`}>
                        <CartPricingBreakdown
                            appearance="cart"
                            subtotal={pricingBreakdown.subtotal}
                            total={pricingBreakdown.total}
                            discountCard={pricingBreakdown.discountCard}
                            giftCertificate={pricingBreakdown.giftCertificate}
                            waitingDiscountAmount={selectedWaitingDiscountAmount}
                            hidePayBar
                        />
                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-admin-border pt-3">
                            <span className="text-base font-semibold text-admin-text">Итого</span>
                            <span className="text-base font-semibold tabular-nums text-admin-text">
                                {formatMoneyRub(checkoutTotalStr)}
                            </span>
                        </div>
                    </div>
                </section>

                <aside className="hidden self-start xl:sticky xl:top-24 xl:block">
                    <div className={`${siteCard} overflow-hidden`}>
                        <div className="p-5 sm:p-6">
                        <div className="mb-3 text-base font-semibold text-admin-text">Ваш заказ</div>

                        <CartPricingBreakdown
                            appearance="cart"
                            subtotal={pricingBreakdown.subtotal}
                            total={pricingBreakdown.total}
                            discountCard={pricingBreakdown.discountCard}
                            giftCertificate={pricingBreakdown.giftCertificate}
                            waitingDiscountAmount={selectedWaitingDiscountAmount}
                            hidePayBar
                        />

                        {partialLineSelection && !partialQuote ? (
                            <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
                                Пересчёт скидок по выбранным позициям…
                            </p>
                        ) : null}
                        {partialLineSelection && partialQuote ? (
                            <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
                                Сумма и скидки по отмеченным позициям. Доставка — на шаге оформления.
                            </p>
                        ) : null}

                        <div className="mt-5 hidden space-y-3 border-t border-[var(--line)] pt-4 md:block">
                            <div>
                                <div className="mb-1 text-xs text-[var(--text-secondary)]">Подарочный сертификат</div>
                                {!cart.gift_certificate ? (
                                    <>
                                        <div className="flex gap-2">
                                            <input
                                                value={giftCertificateCode}
                                                onChange={(e) => {
                                                    setGiftCertificateCode(normalizeGiftCertificateCodeInput(e.target.value));
                                                    setGiftCertificateApplyError("");
                                                }}
                                                maxLength={64}
                                                placeholder="Код сертификата"
                                                autoComplete="off"
                                                className={siteInput}
                                            />
                                            <button
                                                type="button"
                                                disabled={isPending || normalizeGiftCertificateCodeInput(giftCertificateCode) === ""}
                                                onClick={() =>
                                                    startTransition(async () => {
                                                        setGiftCertificateApplyError("");

                                                        if (giftCertificateHoneypot.trim() !== "") {
                                                            setGiftCertificateApplyError("Не удалось применить сертификат");
                                                            return;
                                                        }

                                                        if (Date.now() - giftCertificateLastAttemptAt < 1500) {
                                                            setGiftCertificateApplyError("Слишком частые попытки. Повторите через секунду.");
                                                            return;
                                                        }

                                                        setGiftCertificateLastAttemptAt(Date.now());
                                                        try {
                                                            const response = await applyGiftCertificate(giftCertificateCode);
                                                            setCartState(response.data);
                                                        } catch (e) {
                                                            if (e instanceof GiftCertificateApplyError) {
                                                                setGiftCertificateApplyError(e.message);
                                                                return;
                                                            }
                                                            setGiftCertificateApplyError("Не удалось применить сертификат");
                                                        }
                                                    })
                                                }
                                                className={siteBtnSecondary}
                                            >
                                                Применить
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            value={giftCertificateHoneypot}
                                            onChange={(e) => setGiftCertificateHoneypot(e.target.value)}
                                            tabIndex={-1}
                                            autoComplete="off"
                                            aria-hidden="true"
                                            className="hidden"
                                        />
                                        {giftCertificateApplyError ? (
                                            <div className="mt-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                                {giftCertificateApplyError}
                                            </div>
                                        ) : null}
                                    </>
                                ) : (
                                    <div className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--background)] px-3 py-2">
                                        <div>
                                            <div className="text-xs text-[var(--text-secondary)]">Применён сертификат</div>
                                            <div className="text-sm font-medium text-[var(--foreground)]">
                                                {cart.gift_certificate.code}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={isPending}
                                            onClick={() =>
                                                startTransition(async () => {
                                                    setGiftCertificateApplyError("");
                                                    setGiftCertificateCode("");
                                                    const response = await clearGiftCertificate();
                                                    setCartState(response.data);
                                                })
                                            }
                                            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)] disabled:opacity-40"
                                            aria-label="Убрать сертификат"
                                            title="Убрать сертификат"
                                        >
                                            ×
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div>
                                <div className="mb-1 text-xs text-[var(--text-secondary)]">Скидочная карта</div>
                                {!cardInCart ? (
                                    <>
                                        <div className="flex gap-2">
                                            <input
                                                value={discountCardNumber}
                                                onChange={(e) => {
                                                    setDiscountCardNumber(e.target.value);
                                                    setDiscountCardConflict(null);
                                                    setDiscountCardApplyError("");
                                                }}
                                                placeholder="Номер карты"
                                                className={siteInput}
                                            />
                                            <button
                                                type="button"
                                                disabled={isPending || !discountCardNumber.trim()}
                                                onClick={() =>
                                                    startTransition(async () => {
                                                        setDiscountCardApplyError("");
                                                        try {
                                                            const response = await applyDiscountCard(discountCardNumber.trim(), false);
                                                            setCartState(response.data);
                                                            setDiscountCardConflict(null);
                                                        } catch (e) {
                                                            if (
                                                                e instanceof DiscountCardApplyError &&
                                                                e.code === "USER_ALREADY_HAS_DISCOUNT_CARD" &&
                                                                isAuthenticated
                                                            ) {
                                                                setDiscountCardConflict(discountCardNumber.trim());
                                                                return;
                                                            }
                                                            setDiscountCardApplyError(
                                                                e instanceof Error ? e.message : "Не удалось применить карту"
                                                            );
                                                        }
                                                    })
                                                }
                                                className={siteBtnSecondary}
                                            >
                                                Применить
                                            </button>
                                        </div>
                                        {discountCardApplyError ? (
                                            <div className="mt-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                                {discountCardApplyError}
                                            </div>
                                        ) : null}
                                        {discountCardConflict ? (
                                            <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                                <p className="mb-2">
                                                    Применить эту карту только к текущему заказу? Карта в профиле не изменится.
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        disabled={isPending}
                                                        className="rounded-2xl bg-[var(--accent)] px-3 py-1.5 font-semibold text-[var(--background)] transition hover:bg-[var(--accent-hover)]"
                                                        onClick={() =>
                                                            startTransition(async () => {
                                                                const response = await applyDiscountCard(discountCardConflict, true);
                                                                setCartState(response.data);
                                                                setDiscountCardConflict(null);
                                                                setDiscountCardNumber("");
                                                            })
                                                        }
                                                    >
                                                        Да, только к заказу
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="rounded-2xl border border-amber-300 px-3 py-1.5"
                                                        onClick={() => setDiscountCardConflict(null)}
                                                    >
                                                        Отмена
                                                    </button>
                                                </div>
                                            </div>
                                        ) : null}
                                    </>
                                ) : (
                                    <div className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--background)] px-3 py-2">
                                        <div>
                                            <div className="text-xs text-[var(--text-secondary)]">Применена скидочная карта</div>
                                            <div className="text-sm font-medium text-[var(--foreground)]">
                                                {cardInCart.number}
                                            </div>
                                        </div>
                                        {canRemoveDiscountCard ? (
                                            <button
                                                type="button"
                                                disabled={isPending}
                                                onClick={() =>
                                                    startTransition(async () => {
                                                        const response = await clearDiscountCard();
                                                        setCartState(response.data);
                                                        setDiscountCardConflict(null);
                                                        setDiscountCardApplyError("");
                                                        setDiscountCardNumber("");
                                                    })
                                                }
                                                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)] disabled:opacity-40"
                                                aria-label="Убрать карту"
                                                title="Убрать карту"
                                            >
                                                ×
                                            </button>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-5 hidden border-t border-admin-border pt-4 md:block">
                            <div className="flex items-end justify-between gap-4">
                                <div>
                                    <div className="text-sm text-admin-text-secondary">
                                        {partialLineSelection ? "К оформлению (выбрано)" : "Итого"}
                                    </div>
                                    <div className="mt-1 text-3xl font-semibold leading-none">
                                        {formatMoneyRub(checkoutTotalStr)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="hidden md:block">
                        {hasCheckoutSelection ? (
                            <Link
                                href="/checkout"
                                onClick={persistCheckoutSelection}
                                className={`${siteBtnPrimary} mt-6 w-full px-5 py-3.5 text-base`}
                            >
                                Перейти к оформлению
                            </Link>
                        ) : (
                            <span
                                className={`${siteBtnPrimary} mt-6 w-full cursor-not-allowed px-5 py-3.5 text-base opacity-45`}
                                aria-disabled
                            >
                                Выберите позиции для оформления
                            </span>
                        )}

                        <div className="mt-4 text-xs leading-5 text-[var(--text-secondary)]">
                            После оформления заказа мы свяжемся с вами для подтверждения деталей доставки и оплаты.
                        </div>
                        </div>
                        </div>
                        <CartPricingPayBar total={pricingBreakdown.total} grandTotal={checkoutTotalStr} />
                    </div>
                </aside>
            </div>

            <div
                ref={mobileCheckoutBarRef}
                className="storefront-bottom-cta fixed inset-x-0 z-[130] border-t border-admin-border backdrop-blur-md md:hidden"
                style={{ bottom: "calc(var(--storefront-tab-bar-height, 0px) + var(--storefront-keyboard-inset, 0px))" }}
            >
                <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2.5">
                        <div className="min-w-0 text-2xl font-semibold leading-none tabular-nums text-admin-text">
                            {formatMoneyRub(checkoutTotalStr)}
                        </div>

                        {hasCheckoutSelection ? (
                            <Link
                                href="/checkout"
                                onClick={persistCheckoutSelection}
                                className={`${siteBtnPrimary} ml-auto h-12 shrink-0 px-6 text-base`}
                            >
                                Оформить
                            </Link>
                        ) : (
                            <span
                                className={`${siteBtnPrimary} ml-auto h-12 shrink-0 cursor-not-allowed px-6 text-base opacity-45`}
                                aria-disabled
                            >
                                Оформить
                            </span>
                        )}
                </div>
            </div>

            <SiteConfirmDialog
                open={confirmClearCart}
                title="Очистить корзину?"
                message="Убрать все товары из корзины?"
                confirmText="Очистить"
                loading={isPending}
                onCloseAction={() => setConfirmClearCart(false)}
                onConfirmAction={clearWholeCart}
            />
            <SiteConfirmDialog
                open={pendingDelete !== null}
                title="Удалить из корзины?"
                message={
                    pendingDelete
                        ? `Убрать «${withBynSignReplacingCodeText(pendingDelete.title)}» из корзины?`
                        : ""
                }
                confirmText="Удалить"
                loading={isPending}
                onCloseAction={() => setPendingDelete(null)}
                onConfirmAction={confirmPendingDelete}
            />
        </main>
    );
}
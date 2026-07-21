"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
    CHECKOUT_LINE_SELECTION_STORAGE_KEY,
    createOrder,
    fetchCheckoutQuote,
    fetchCheckoutShopSettings,
    searchCheckoutCities,
    type CheckoutCityHit,
    type CheckoutDeliveryMethod,
    type CheckoutLineSelectionStored,
    type CheckoutPaymentMethod,
    type CheckoutQuote,
    type CheckoutShopSettings,
} from "@/lib/checkout-api";
import {
    applyDiscountCard,
    applyGiftCertificate,
    clearDiscountCard,
    clearGiftCertificate,
    DiscountCardApplyError,
    fetchCart,
    GiftCertificateApplyError,
    normalizeGiftCertificateCodeInput,
} from "@/lib/cart-api";
import { useCart } from "@/components/cart/cart-provider";
import { lineItemProductTitle } from "@/lib/product-display-name";
import { useAuth } from "@/components/auth/auth-provider";
import { authUserCheckoutName } from "@/lib/auth-api";
import CartPricingBreakdown from "@/components/cart/cart-pricing-breakdown";
import { formatMoneyDisplay, formatMoneyRub } from "@/lib/format-money-display";
import PhoneInput, {
    isBelarusPhoneComplete,
    isPlainByPhoneComplete,
    normalizePlainByDigitsInput,
} from "@/components/ui/phone-input";
import useDebouncedValue from "@/hooks/use-debounced-value";
import {
    breakdownSubtotalFromQuote,
    countCheckoutLinesQty,
    discountCardForBreakdownFromQuote,
    filterCartLinesForCheckout,
    giftForBreakdownFromQuote,
    merchandisePayFromQuote,
    parseCheckoutMoney,
    sanitizeCheckoutLineSelectionForCart,
    selectionSignature,
    waitingDiscountAmountForLines,
} from "@/lib/checkout-line-selection";
import { siteBtnPrimary, siteBtnSecondary, siteCard, siteInput } from "@/lib/site-ui-classes";

const PICKUP_HINT =
    "Самовывоз: В связи с переходом на удалённый режим работы, забрать самостоятельно ваш заказ можно по домашнему адресу менеджера (ул. Чичурина). Обязательно предварительное согласование времени, чтобы курьер успел переместить ваш заказ со склада к менеджеру.";

function deliveryHint(
    method: CheckoutDeliveryMethod,
    shopSettings: CheckoutShopSettings | null,
): string {
    if (method === "pickup") {
        return PICKUP_HINT;
    }
    if (method === "minsk_courier") {
        const threshold = formatMoneyRub(String(shopSettings?.delivery_minsk_free_threshold ?? 50));
        const fee = formatMoneyRub(String(shopSettings?.delivery_minsk_fee ?? 3));
        return `Доставка осуществляется по Минску бесплатно, если сумма заказа более ${threshold}. Стоимость доставки меньше этой суммы составляет ${fee} Данный способ доставки дает вам возможность получить товар прямо в руки, курьером в Минске. Время доставки оговаривайте с менеджером в момент заказа товара в интернет-магазине.`;
    }
    const minLines = shopSettings?.delivery_belarus_free_min_lines ?? 2;
    const fee = formatMoneyRub(String(shopSettings?.delivery_belarus_fee ?? 6));
    return `Доставка по РБ курьерской службой осуществляется бесплатно при заказе от ${minLines} наименований. В остальных случаях стоимость такой доставки составляет всего ${fee} Сроки доставки 1-2 дня. Оплата курьеру при получении товара.`;
}

const PAYMENT_HINTS: Record<CheckoutPaymentMethod, string> = {
    cash: "Оплатить заказ товара Вы сможете непосредственно курьеру в руки при получение товара.",
    card: "Оплата при получении (только при доставке по Минску или самовывозе).",
};

const CARD_PAYMENT_WARNING = "Внимание: при оплате по карте — скидки не предоставляются.";

export default function CheckoutPage() {
    const router = useRouter();
    const { cart, loading, setCartState, refreshCart } = useCart();
    const { user, isAuthenticated } = useAuth();

    const [customerName, setCustomerName] = useState("");
    const [phone, setPhone] = useState("");
    const [allowPlainPhone, setAllowPlainPhone] = useState(false);
    const [comment, setComment] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isPending, startTransition] = useTransition();

    const [shopSettings, setShopSettings] = useState<CheckoutShopSettings | null>(null);
    const [deliveryMethod, setDeliveryMethod] = useState<CheckoutDeliveryMethod>("minsk_courier");
    const [deliveryCity, setDeliveryCity] = useState("");
    const [cityQuery, setCityQuery] = useState("");
    const debouncedCityQuery = useDebouncedValue(cityQuery, 350);
    const [cityHits, setCityHits] = useState<CheckoutCityHit[]>([]);
    const [cityOpen, setCityOpen] = useState(false);
    const [cityLookupFailed, setCityLookupFailed] = useState(false);
    const [deliveryAddress, setDeliveryAddress] = useState("");
    const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>("cash");
    const [quote, setQuote] = useState<CheckoutQuote | null>(null);
    const [quoteError, setQuoteError] = useState("");

    const [giftCertificateCode, setGiftCertificateCode] = useState("");
    const [giftCertificateHoneypot, setGiftCertificateHoneypot] = useState("");
    const [giftCertificateLastAttemptAt, setGiftCertificateLastAttemptAt] = useState(0);
    const [giftCertificateApplyError, setGiftCertificateApplyError] = useState("");
    const [discountCardNumber, setDiscountCardNumber] = useState("");
    const [discountCardConflict, setDiscountCardConflict] = useState<string | null>(null);
    const [discountCardApplyError, setDiscountCardApplyError] = useState("");
    const [checkoutLineFilter, setCheckoutLineFilter] = useState<CheckoutLineSelectionStored | null>(null);
    const [phoneTouched, setPhoneTouched] = useState(false);
    const [addressTouched, setAddressTouched] = useState(false);
    const [submitAttempted, setSubmitAttempted] = useState(false);

    const phoneIsValid = allowPlainPhone ? isPlainByPhoneComplete(phone) : isBelarusPhoneComplete(phone);
    const addressRequired = deliveryMethod !== "pickup";
    const addressIsValid = !addressRequired || deliveryAddress.trim().length > 0;
    const showPhoneError = (phoneTouched || submitAttempted) && !phoneIsValid;
    const showAddressError = (addressTouched || submitAttempted) && addressRequired && !addressIsValid;

    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(CHECKOUT_LINE_SELECTION_STORAGE_KEY);
            if (!raw) {
                return;
            }
            sessionStorage.removeItem(CHECKOUT_LINE_SELECTION_STORAGE_KEY);
            const parsed = JSON.parse(raw) as {
                cart_item_ids?: unknown;
                gift_certificate_cart_item_ids?: unknown;
            };
            const cartIds = Array.isArray(parsed.cart_item_ids)
                ? parsed.cart_item_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
                : [];
            const giftIds = Array.isArray(parsed.gift_certificate_cart_item_ids)
                ? parsed.gift_certificate_cart_item_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
                : [];
            if (cartIds.length === 0 && giftIds.length === 0) {
                return;
            }
            queueMicrotask(() => {
                setCheckoutLineFilter({
                    cart_item_ids: cartIds,
                    gift_certificate_cart_item_ids: giftIds,
                });
            });
        } catch {
            /* ignore */
        }
    }, []);

    useEffect(() => {
        if (!cart || !checkoutLineFilter) {
            return;
        }
        const sanitized = sanitizeCheckoutLineSelectionForCart(cart, checkoutLineFilter);
        if (sanitized === null) {
            queueMicrotask(() => {
                setCheckoutLineFilter(null);
            });
            return;
        }
        if (selectionSignature(sanitized) !== selectionSignature(checkoutLineFilter)) {
            queueMicrotask(() => {
                setCheckoutLineFilter(sanitized);
            });
        }
    }, [cart, checkoutLineFilter]);

    const effectiveCheckoutLineSelection = useMemo(
        () => sanitizeCheckoutLineSelectionForCart(cart, checkoutLineFilter),
        [cart, checkoutLineFilter],
    );

    const checkoutCartLines = useMemo(
        () => (cart ? filterCartLinesForCheckout(cart, effectiveCheckoutLineSelection) : { items: [], giftItems: [] }),
        [cart, effectiveCheckoutLineSelection],
    );

    const checkoutLinesQty = useMemo(
        () => countCheckoutLinesQty(checkoutCartLines.items, checkoutCartLines.giftItems),
        [checkoutCartLines],
    );

    const waitingDiscountAmount = useMemo(
        () => waitingDiscountAmountForLines(checkoutCartLines.items),
        [checkoutCartLines.items],
    );

    const checkoutQuotePayload = useMemo(() => {
        const base = { payment_method: paymentMethod, delivery_method: deliveryMethod };
        if (!effectiveCheckoutLineSelection) {
            return base;
        }
        return {
            ...base,
            cart_item_ids: effectiveCheckoutLineSelection.cart_item_ids,
            gift_certificate_cart_item_ids: effectiveCheckoutLineSelection.gift_certificate_cart_item_ids,
        };
    }, [effectiveCheckoutLineSelection, deliveryMethod, paymentMethod]);

    useEffect(() => {
        if (!user) {
            return;
        }
        if (!phone && user.phone) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- однократная инициализация из auth/me
            setPhone(user.phone);
        }
        if (!customerName) {
            const name = authUserCheckoutName(user);
            if (name) {
                setCustomerName(name);
            }
        }
    }, [user, phone, customerName]);

    useEffect(() => {
        void fetchCheckoutShopSettings()
            .then((r) => setShopSettings(r.data))
            .catch(() => setShopSettings(null));
    }, []);

    useEffect(() => {
        if (deliveryCity.trim()) {
            queueMicrotask(() => {
                setCityHits([]);
                setCityLookupFailed(false);
            });
            return;
        }
        if (debouncedCityQuery.trim().length < 2) {
            queueMicrotask(() => {
                setCityHits([]);
                setCityLookupFailed(false);
            });
            return;
        }
        let cancelled = false;
        void searchCheckoutCities(debouncedCityQuery)
            .then((r) => {
                if (!cancelled) {
                    setCityHits(r.data || []);
                    setCityLookupFailed(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setCityHits([]);
                    setCityLookupFailed(true);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [debouncedCityQuery, deliveryCity]);

    const refreshQuote = useCallback(async () => {
        if (!cart?.token) return;
        setQuoteError("");
        try {
            const r = await fetchCheckoutQuote(checkoutQuotePayload);
            setQuote(r.data);
        } catch {
            setQuote(null);
            setQuoteError("Не удалось пересчитать заказ");
        }
    }, [cart?.token, checkoutQuotePayload]);

    useEffect(() => {
        if (!cart) return;
        const hasLines =
            cart.items.length > 0 || (cart.gift_certificate_items?.length ?? 0) > 0;
        if (!hasLines) return;
        queueMicrotask(() => {
            void refreshQuote();
        });
    }, [cart, refreshQuote]);

    const handleDeliveryMethodChange = useCallback((value: CheckoutDeliveryMethod) => {
        setDeliveryMethod(value);
        if (value === "belarus_courier") {
            setPaymentMethod((pm) => (pm === "card" ? "cash" : pm));
        }
    }, []);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        setErrorMessage("");
        setSubmitAttempted(true);
        setPhoneTouched(true);
        if (addressRequired) {
            setAddressTouched(true);
        }

        if (!phoneIsValid) {
            setErrorMessage(
                allowPlainPhone
                    ? "Укажите номер с кодом страны: 8–15 цифр."
                    : "Введите корректный номер: +375 (25/29/33/44) XXX-XX-XX",
            );
            return;
        }

        if (deliveryMethod !== "pickup" && !deliveryAddress.trim()) {
            setErrorMessage("Укажите адрес доставки");
            return;
        }

        const orderDeliveryAddress = deliveryMethod === "pickup"
            ? "нет - самовывоз"
            : deliveryAddress.trim();

        startTransition(async () => {
            try {
                const lineSelection = sanitizeCheckoutLineSelectionForCart(cart, checkoutLineFilter);
                const response = await createOrder({
                    customer_name: customerName,
                    phone,
                    phone_plain_digits: allowPlainPhone,
                    comment,
                    delivery_method: deliveryMethod,
                    delivery_city: deliveryCity.trim() || cityQuery.trim() || null,
                    delivery_address: orderDeliveryAddress,
                    payment_method: paymentMethod,
                    ...(lineSelection
                        ? {
                              cart_item_ids: lineSelection.cart_item_ids,
                              gift_certificate_cart_item_ids: lineSelection.gift_certificate_cart_item_ids,
                          }
                        : {}),
                });

                setCheckoutLineFilter(null);
                try {
                    const cartResponse = await fetchCart();
                    setCartState(cartResponse.data);
                } catch {
                    await refreshCart();
                }

                router.push(`/checkout/success?order=${response.data.id}`);
            } catch (error) {
                console.error(error);
                const text =
                    error instanceof Error && error.message.trim() !== ""
                        ? error.message
                        : "Не удалось оформить заказ";
                setErrorMessage(text);
            }
        });
    };

    if (loading) {
        return (
            <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
                <p className="text-sm text-admin-text-secondary">Загрузка корзины…</p>
            </main>
        );
    }

    if (
        !cart ||
        (cart.items.length === 0 && (cart.gift_certificate_items?.length ?? 0) === 0)
    ) {
        return (
            <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h1 className="text-3xl font-semibold">Оформление заказа</h1>
                    <Link
                        href="/cart"
                        className={`${siteBtnSecondary} gap-1.5 self-start`}
                    >
                        <ChevronLeft className="h-4 w-4 shrink-0 text-admin-primary" aria-hidden />
                        В корзину
                    </Link>
                </div>
                <p className="mb-6 text-admin-text-secondary">Корзина пуста.</p>
                <Link href="/catalog" className={siteBtnPrimary}>
                    Перейти в каталог
                </Link>
            </main>
        );
    }

    const cardInCheckout = cart.discount_card ?? null;
    const canRemoveDiscountCard = Boolean(cardInCheckout);

    const discountCardForBreakdown = discountCardForBreakdownFromQuote(cart, quote);

    const giftForBreakdown = giftForBreakdownFromQuote(cart, quote);

    const breakdownSubtotal = quote != null ? breakdownSubtotalFromQuote(quote) : cart.subtotal;

    const merchandisePayStr = quote != null ? merchandisePayFromQuote(quote) : (cart.total ?? cart.subtotal);

    return (
        <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-3xl font-semibold">Оформление заказа</h1>
                <Link href="/cart" className={`${siteBtnSecondary} gap-1.5 self-start`}>
                    <ChevronLeft className="h-4 w-4 shrink-0 text-admin-primary" aria-hidden />
                    В корзину
                </Link>
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
                <form onSubmit={handleSubmit} className={`${siteCard} p-5`}>
                    <div className="mb-5">
                        <label className="mb-2 block text-sm font-medium text-admin-text">Имя</label>
                        <input
                            type="text"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            className={siteInput}
                            placeholder="Ваше имя"
                        />
                    </div>

                    <div className="mb-5">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <label className="text-sm font-medium text-admin-text">Телефон *</label>
                            <label className="inline-flex cursor-pointer items-center">
                                <input
                                    type="checkbox"
                                    checked={allowPlainPhone}
                                    onChange={(e) => {
                                        setAllowPlainPhone(e.target.checked);
                                        setPhone((prev) =>
                                            e.target.checked ? normalizePlainByDigitsInput(prev) : prev,
                                        );
                                    }}
                                    className="peer sr-only"
                                />
                                <span
                                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                                        allowPlainPhone
                                            ? "border-admin-primary bg-admin-primary text-white"
                                            : "border-admin-border bg-admin-surface text-admin-text-secondary hover:bg-admin-muted"
                                    }`}
                                >
                                    Международный номер
                                </span>
                            </label>
                        </div>
                        <div onBlur={() => setPhoneTouched(true)}>
                            <PhoneInput value={phone} onChangeAction={setPhone} plainDigitsMode={allowPlainPhone} />
                        </div>
                        {showPhoneError ? (
                            <p className="mt-2 text-xs text-red-600">
                                {allowPlainPhone
                                    ? "Укажите номер с кодом страны: 8–15 цифр."
                                    : "Введите корректный номер: +375 (25/29/33/44) XXX-XX-XX"}
                            </p>
                        ) : null}
                    </div>

                    <fieldset className="mb-5">
                        <legend className="mb-2 text-sm font-medium text-admin-text">Способ доставки *</legend>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            {(
                                [
                                    ["minsk_courier", "Курьер по Минску"],
                                    ["belarus_courier", "Курьер по РБ"],
                                    ["pickup", "Самовывоз"],
                                ] as const
                            ).map(([value, label]) => {
                                const active = deliveryMethod === value;
                                return (
                                    <label
                                        key={value}
                                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${
                                            active
                                                ? "border-admin-primary bg-admin-muted text-admin-text"
                                                : "border-admin-border bg-admin-surface text-admin-text-secondary hover:bg-admin-muted/70"
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="delivery_method"
                                            value={value}
                                            checked={active}
                                            onChange={() => handleDeliveryMethodChange(value)}
                                            className="accent-admin-primary"
                                        />
                                        <span>{label}</span>
                                    </label>
                                );
                            })}
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                            {deliveryHint(deliveryMethod, shopSettings)}
                        </p>
                    </fieldset>

                    {deliveryMethod === "belarus_courier" ? (
                        <div className="mb-5">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <label className="text-sm font-medium">Населённый пункт</label>
                            </div>
                            <div className="relative">
                                <input
                                    value={deliveryCity.trim() || cityQuery}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setCityQuery(v);
                                        if (deliveryCity.trim()) {
                                            setDeliveryCity("");
                                        }
                                        setCityOpen(true);
                                        setCityLookupFailed(false);
                                    }}
                                    onFocus={() => setCityOpen(true)}
                                    className={siteInput}
                                    placeholder="Поиск по Беларуси"
                                />
                                {cityOpen && cityHits.length > 0 ? (
                                    <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] text-sm shadow-lg">
                                        {cityHits.map((h) => (
                                            <li key={h.id}>
                                                <button
                                                    type="button"
                                                    className="w-full px-3 py-2 text-left hover:bg-[var(--background)]"
                                                    onClick={() => {
                                                        setDeliveryCity(h.full_name.trim());
                                                        setCityQuery("");
                                                        setCityOpen(false);
                                                    }}
                                                >
                                                    <div className="font-medium text-[var(--foreground)]">
                                                        {h.full_name}
                                                    </div>
                                                    {h.type ? (
                                                        <div className="text-xs text-[var(--text-secondary)]">
                                                            {h.type}
                                                            {h.region_name ? ` · ${h.region_name}` : ""}
                                                        </div>
                                                    ) : null}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                                {!deliveryCity.trim() &&
                                cityQuery.trim().length >= 2 &&
                                cityHits.length === 0 ? (
                                    <p className="mt-2 text-xs text-[var(--text-secondary)]">
                                        {cityLookupFailed
                                            ? "Поиск временно недоступен."
                                            : "Населённый пункт не найден в списке — в заказ уйдёт введённое название."}
                                    </p>
                                ) : null}
                            </div>
                        </div>
                    ) : null}

                    {deliveryMethod === "pickup" ? null : (
                        <div className="mb-5">
                            <label className="mb-2 block text-sm font-medium">Адрес доставки *</label>
                            <textarea
                                value={deliveryAddress}
                                onChange={(e) => setDeliveryAddress(e.target.value)}
                                onBlur={() => setAddressTouched(true)}
                                className={`${siteInput} min-h-24`}
                                placeholder="Улица, дом, подъезд, этаж, домофон…"
                                required={addressRequired}
                            />
                            {showAddressError ? (
                                <p className="mt-2 text-xs text-red-600">Укажите адрес доставки</p>
                            ) : null}
                        </div>
                    )}

                    <fieldset className="mb-5">
                        <legend className="mb-2 text-sm font-medium text-admin-text">Способ оплаты *</legend>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {(
                                [
                                    ["cash", "Наличными"],
                                    ["card", "Картой (Visa и MasterCard)"],
                                ] as const
                            ).map(([value, label]) => {
                                const disabled = value === "card" && deliveryMethod === "belarus_courier";
                                const active = paymentMethod === value;
                                return (
                                    <label
                                        key={value}
                                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${
                                            disabled
                                                ? "cursor-not-allowed border-admin-border bg-admin-muted/40 opacity-50"
                                                : active
                                                  ? "border-admin-primary bg-admin-muted text-admin-text"
                                                  : "border-admin-border bg-admin-surface text-admin-text-secondary hover:bg-admin-muted/70"
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="payment_method"
                                            value={value}
                                            checked={active}
                                            disabled={disabled}
                                            onChange={() => setPaymentMethod(value)}
                                            className="accent-admin-primary"
                                        />
                                        <span>{label}</span>
                                    </label>
                                );
                            })}
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                            {PAYMENT_HINTS[paymentMethod]}
                            {paymentMethod === "card" ? (
                                <>
                                    {" "}
                                    <span className="font-semibold text-amber-800">{CARD_PAYMENT_WARNING}</span>
                                </>
                            ) : null}
                        </p>
                    </fieldset>

                    <div className="mb-5">
                        <label className="mb-2 block text-sm font-medium">Комментарий</label>
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className={`${siteInput} min-h-28`}
                            placeholder="Комментарий к заказу"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isPending || !phoneIsValid || !addressIsValid}
                        className={`${siteBtnPrimary} w-full px-5 py-3 text-base sm:w-auto`}
                    >
                        {isPending ? "Оформление..." : "Подтвердить заказ"}
                    </button>

                    {errorMessage && (
                        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {errorMessage}
                        </div>
                    )}
                </form>

                <aside className={`${siteCard} p-5`}>
                    <div className="mb-4 text-lg font-medium text-admin-text">Ваш заказ</div>

                    <div className="space-y-4">
                        {effectiveCheckoutLineSelection ? (
                            <p className="mb-3 text-xs leading-5 text-[var(--text-secondary)]">
                                К оформлению выбраны не все позиции из корзины.
                            </p>
                        ) : null}
                        {checkoutCartLines.giftItems.map((item) => (
                            <div
                                key={`gift-template-${item.id}`}
                                className="border-b border-[var(--line)] pb-4 last:border-b-0"
                            >
                                <div className="text-sm text-[var(--text-secondary)]">Сертификат</div>
                                <div className="font-medium">{item.title}</div>
                                <div className="mt-1 text-sm text-[var(--text-secondary)]">
                                    {item.qty} × {formatMoneyRub(item.amount)}
                                </div>
                            </div>
                        ))}
                        {checkoutCartLines.items.map((item) => (
                            <div key={item.id} className="border-b border-[var(--line)] pb-4 last:border-b-0">
                                <div className="font-medium">{lineItemProductTitle(item)}</div>
                                <div className="text-sm text-[var(--text-secondary)]">
                                    {item.variant?.display_name || item.variant?.title}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)]">
                                    <span>
                                        {item.qty} × {formatMoneyRub(item.price)}
                                        {item.waiting_discount && item.base_price && (
                                            <span className="ml-2 line-through">
                                                {formatMoneyRub(item.base_price)}
                                            </span>
                                        )}
                                    </span>
                                    {item.waiting_discount && item.waiting_discount_percent !== null && (
                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                            -{item.waiting_discount_percent}% за ожидание
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 border-t border-[var(--line)] pt-4">
                        {quoteError ? <p className="mb-2 text-xs text-amber-700">{quoteError}</p> : null}
                        <CartPricingBreakdown
                            itemsQty={checkoutLinesQty}
                            subtotal={breakdownSubtotal}
                            total={merchandisePayStr}
                            discountCard={discountCardForBreakdown}
                            giftCertificate={giftForBreakdown}
                            deliveryFee={quote?.delivery_fee}
                            grandTotal={quote?.total}
                            waitingDiscountAmount={waitingDiscountAmount}
                        />
                    </div>

                    <div className="mt-5 space-y-3 border-t border-[var(--line)] pt-4">
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
                                            className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm outline-none"
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
                                                        setGiftCertificateApplyError(
                                                            "Слишком частые попытки. Повторите через секунду.",
                                                        );
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
                                            className="shrink-0 rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
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
                                        <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                            {giftCertificateApplyError}
                                        </div>
                                    ) : null}
                                </>
                            ) : (
                                <div className="flex items-start justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 py-2">
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
                                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)] disabled:opacity-40"
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
                            {!cart.discount_card ? (
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
                                            className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm"
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
                                                            e instanceof Error ? e.message : "Не удалось применить карту",
                                                        );
                                                    }
                                                })
                                            }
                                            className="shrink-0 rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                                        >
                                            Применить
                                        </button>
                                    </div>
                                    {discountCardApplyError ? (
                                        <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                            {discountCardApplyError}
                                        </div>
                                    ) : null}
                                    {discountCardConflict ? (
                                        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                            <p className="mb-2">
                                                Применить эту карту только к текущему заказу? Карта в профиле не изменится.
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    disabled={isPending}
                                                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 font-semibold text-[var(--background)] transition hover:bg-[var(--accent-hover)]"
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
                                                    className="rounded-lg border border-amber-300 px-3 py-1.5"
                                                    onClick={() => setDiscountCardConflict(null)}
                                                >
                                                    Отмена
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                </>
                            ) : (
                                <div className="flex items-start justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 py-2">
                                    <div>
                                        <div className="text-xs text-[var(--text-secondary)]">Применена скидочная карта</div>
                                        <div className="text-sm font-medium text-[var(--foreground)]">
                                            {cart.discount_card.number}
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
                                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)] disabled:opacity-40"
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

                    {cardInCheckout ? (
                        <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
                            Карта <span className="font-mono text-[var(--foreground)]">{cardInCheckout.number}</span> в корзине.
                            {paymentMethod === "card"
                                ? " При оплате картой процент скидки к заказу не применяется."
                                : parseCheckoutMoney(quote?.loyalty_discount_amount ?? cardInCheckout.discount_amount) > 0
                                  ? ` Скидка: ${quote?.loyalty_discount_percent ?? cardInCheckout.discount_percent}% (−${
                                        formatMoneyDisplay(
                                            quote?.loyalty_discount_amount ?? cardInCheckout.discount_amount,
                                        ) ??
                                        (quote?.loyalty_discount_amount ?? cardInCheckout.discount_amount)
                                    } руб.).`
                                  : " Скидка по карте для текущих условий не применяется."}
                        </p>
                    ) : null}
                </aside>
            </div>
        </main>
    );
}

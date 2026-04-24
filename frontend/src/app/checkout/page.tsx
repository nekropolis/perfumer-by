"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
    createOrder,
    fetchCheckoutQuote,
    fetchCheckoutShopSettings,
    searchCheckoutCities,
    type CheckoutCityHit,
    type CheckoutDeliveryMethod,
    type CheckoutPaymentMethod,
    type CheckoutQuote,
    type CheckoutShopSettings,
} from "@/lib/checkout-api";
import { useCart } from "@/components/cart/cart-provider";
import { useAuth } from "@/components/auth/auth-provider";
import CartPricingBreakdown from "@/components/cart/cart-pricing-breakdown";
import PhoneInput, { isBelarusPhoneComplete } from "@/components/ui/phone-input";
import useDebouncedValue from "@/hooks/use-debounced-value";

function parseMoney(s: string): number {
    const n = Number.parseFloat(s.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
}

const DELIVERY_HINTS: Record<CheckoutDeliveryMethod, string> = {
    minsk_courier:
        "Доставка по Минску бесплатно, если сумма заказа (после скидки по карте) выше порога из настроек. Иначе — фиксированная стоимость курьера по Минску. Время доставки согласуйте с менеджером.",
    belarus_courier:
        "Доставка по РБ курьерской служмой: бесплатно при заказе от двух наименований (строк корзины), если у варианта не отмечено «не учитывать в 2 наименования». Иначе — фиксированная стоимость. Сроки 1–2 дня.",
    pickup:
        "Самовывоз: забрать заказ можно по адресу менеджера (ул. Чичурина) после согласования времени — курьер доставит заказ со склада к менеджеру.",
};

const PAYMENT_HINTS: Record<CheckoutPaymentMethod, string> = {
    cash: "Оплата наличными курьеру при получении.",
    card: "Оплата картой при получении (при доставке по Минску или самовывозе). При оплате картой скидка по накопительной карте не применяется.",
};

export default function CheckoutPage() {
    const router = useRouter();
    const { cart, setCartState } = useCart();
    const { user } = useAuth();

    const [customerName, setCustomerName] = useState("");
    const [phone, setPhone] = useState("");
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
    const [manualCity, setManualCity] = useState(false);
    const [cityLookupFailed, setCityLookupFailed] = useState(false);
    const [deliveryAddress, setDeliveryAddress] = useState("");
    const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>("cash");
    const [quote, setQuote] = useState<CheckoutQuote | null>(null);
    const [quoteError, setQuoteError] = useState("");

    const phoneIsValid = isBelarusPhoneComplete(phone);

    useEffect(() => {
        if (!phone && user?.phone) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- однократная инициализация из auth/me
            setPhone(user.phone);
        }
    }, [user?.phone, phone]);

    useEffect(() => {
        void fetchCheckoutShopSettings()
            .then((r) => setShopSettings(r.data))
            .catch(() => setShopSettings(null));
    }, []);

    useEffect(() => {
        if (manualCity) {
            setCityHits([]);
            setCityLookupFailed(false);
            return;
        }
        if (debouncedCityQuery.trim().length < 2) {
            setCityHits([]);
            setCityLookupFailed(false);
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
    }, [debouncedCityQuery, manualCity]);

    const refreshQuote = useCallback(async () => {
        if (!cart?.token) return;
        setQuoteError("");
        try {
            const r = await fetchCheckoutQuote({ payment_method: paymentMethod, delivery_method: deliveryMethod });
            setQuote(r.data);
        } catch {
            setQuote(null);
            setQuoteError("Не удалось пересчитать заказ");
        }
    }, [cart?.token, deliveryMethod, paymentMethod]);

    useEffect(() => {
        if (!cart || cart.items.length === 0) return;
        void refreshQuote();
    }, [cart, refreshQuote]);

    useEffect(() => {
        if (deliveryMethod === "belarus_courier" && paymentMethod === "card") {
            setPaymentMethod("cash");
        }
    }, [deliveryMethod, paymentMethod]);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        setErrorMessage("");

        if (!phoneIsValid) {
            setErrorMessage("Введите корректный номер: +375 (25/29/33/44) XXX-XX-XX");
            return;
        }

        if (deliveryMethod !== "pickup" && !deliveryAddress.trim()) {
            setErrorMessage("Укажите адрес доставки или комментарий для самовывоза");
            return;
        }

        const orderDeliveryAddress = deliveryMethod === "pickup"
            ? "нет - самовывоз"
            : deliveryAddress.trim();

        startTransition(async () => {
            try {
                const response = await createOrder({
                    customer_name: customerName,
                    phone,
                    comment,
                    delivery_method: deliveryMethod,
                    delivery_city: deliveryCity.trim() || null,
                    delivery_address: orderDeliveryAddress,
                    payment_method: paymentMethod,
                });

                setCartState({
                    id: cart?.id ?? 0,
                    token: cart?.token ?? "",
                    qty: 0,
                    subtotal: "0.00",
                    products_subtotal: "0.00",
                    gift_certificates_subtotal: "0.00",
                    total: "0.00",
                    gift_certificate: null,
                    discount_card: null,
                    items: [],
                    gift_certificate_items: [],
                });

                router.push(`/checkout/success?order=${response.data.id}`);
            } catch (error) {
                console.error(error);
                setErrorMessage("Не удалось оформить заказ");
            }
        });
    };

    if (!cart || cart.items.length === 0) {
        return (
            <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
                <h1 className="mb-6 text-3xl font-semibold">Оформление заказа</h1>
                <p className="mb-6 text-[var(--text-secondary)]">Корзина пуста.</p>
                <Link href="/catalog" className="inline-block rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2">
                    Перейти в каталог
                </Link>
            </main>
        );
    }

    const cardInCheckout = cart.discount_card ?? null;

    const discountCardForBreakdown =
        quote == null
            ? cart.discount_card ?? null
            : parseMoney(quote.loyalty_discount_amount) > 0 && cart.discount_card
              ? {
                    number: cart.discount_card.number,
                    discount_percent: quote.loyalty_discount_percent,
                    discount_amount: quote.loyalty_discount_amount,
                    session_only: cart.discount_card.session_only,
                }
              : null;

    const giftForBreakdown =
        quote == null
            ? cart.gift_certificate ?? null
            : parseMoney(quote.gift_certificate_amount) > 0 && cart.gift_certificate
              ? {
                    code: cart.gift_certificate.code,
                    number: cart.gift_certificate.number,
                    amount: quote.gift_certificate_amount,
                }
              : null;

    const merchandisePayStr =
        quote != null
            ? Math.max(
                  0,
                  parseMoney(quote.subtotal) -
                      parseMoney(quote.loyalty_discount_amount) -
                      parseMoney(quote.gift_certificate_amount),
              ).toFixed(2)
            : (cart.total ?? cart.subtotal);

    return (
        <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
            <h1 className="mb-8 text-3xl font-semibold">Оформление заказа</h1>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
                <form onSubmit={handleSubmit} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
                    <div className="mb-5">
                        <label className="mb-2 block text-sm font-medium">Имя</label>
                        <input
                            type="text"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-soft)]"
                            placeholder="Ваше имя"
                        />
                    </div>

                    <div className="mb-5">
                        <label className="mb-2 block text-sm font-medium">Телефон *</label>
                        <PhoneInput value={phone} onChangeAction={setPhone} />
                    </div>

                    <fieldset className="mb-5">
                        <legend className="mb-2 text-sm font-medium">Способ доставки *</legend>
                        <div className="space-y-2 text-sm">
                            {(
                                [
                                    ["minsk_courier", "Курьер по Минску"],
                                    ["belarus_courier", "Курьер по РБ"],
                                    ["pickup", "Самовывоз"],
                                ] as const
                            ).map(([value, label]) => (
                                <label key={value} className="flex cursor-pointer items-start gap-2 rounded-lg border border-transparent px-1 py-1 hover:bg-[var(--background)]">
                                    <input
                                        type="radio"
                                        name="delivery_method"
                                        value={value}
                                        checked={deliveryMethod === value}
                                        onChange={() => setDeliveryMethod(value)}
                                        className="mt-1"
                                    />
                                    <span>{label}</span>
                                </label>
                            ))}
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{DELIVERY_HINTS[deliveryMethod]}</p>
                        {shopSettings && deliveryMethod === "minsk_courier" ? (
                            <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                Бесплатно от {shopSettings.delivery_minsk_free_threshold} руб. (после скидки по карте). Иначе{" "}
                                {shopSettings.delivery_minsk_fee} руб.
                            </p>
                        ) : null}
                        {shopSettings && deliveryMethod === "belarus_courier" ? (
                            <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                Бесплатно от {shopSettings.delivery_belarus_free_min_lines} наименований (без учёта позиций с флагом
                                «не в 2 наименования»). Иначе {shopSettings.delivery_belarus_fee} руб.
                            </p>
                        ) : null}
                    </fieldset>

                    {deliveryMethod === "belarus_courier" ? (
                        <div className="mb-5">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <label className="text-sm font-medium">Населённый пункт</label>
                            </div>
                            {manualCity ? (
                                <div className="space-y-2">
                                    <input
                                        value={deliveryCity}
                                        onChange={(e) => setDeliveryCity(e.target.value)}
                                        className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm"
                                        placeholder="Город / посёлок"
                                    />
                                    <button
                                        type="button"
                                        className="text-xs text-[var(--text-secondary)] underline"
                                        onClick={() => {
                                            setManualCity(false);
                                            setCityQuery(deliveryCity);
                                            setCityOpen(true);
                                        }}
                                    >
                                        Вернуться к поиску
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <input
                                        value={cityQuery}
                                        onChange={(e) => {
                                            setCityQuery(e.target.value);
                                            setCityOpen(true);
                                            setCityLookupFailed(false);
                                        }}
                                        onFocus={() => setCityOpen(true)}
                                        className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm"
                                        placeholder="Поиск по Беларуси (OpenStreetMap)"
                                    />
                                    {cityOpen && cityHits.length > 0 ? (
                                        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] text-sm shadow-lg">
                                            {cityHits.map((h) => (
                                                <li key={h.id}>
                                                    <button
                                                        type="button"
                                                        className="w-full px-3 py-2 text-left hover:bg-[var(--background)]"
                                                        onClick={() => {
                                                            setDeliveryCity(h.name);
                                                            setCityQuery(h.name);
                                                            setCityOpen(false);
                                                        }}
                                                    >
                                                        {h.name}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : null}
                                    {cityQuery.trim().length >= 2 && cityHits.length === 0 ? (
                                        <div className="mt-2">
                                            <p className="mb-1 text-xs text-[var(--text-secondary)]">
                                                {cityLookupFailed
                                                    ? "Поиск временно недоступен."
                                                    : "Населённый пункт не найден в списке."}
                                            </p>
                                            <button
                                                type="button"
                                                className="text-xs text-[var(--text-secondary)] underline"
                                                onClick={() => {
                                                    setManualCity(true);
                                                    setDeliveryCity(cityQuery.trim());
                                                    setCityOpen(false);
                                                }}
                                            >
                                                Ввести вручную
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            )}
                        </div>
                    ) : null}

                    {deliveryMethod === "pickup" ? null : (
                        <div className="mb-5">
                            <label className="mb-2 block text-sm font-medium">Адрес доставки *</label>
                            <textarea
                                value={deliveryAddress}
                                onChange={(e) => setDeliveryAddress(e.target.value)}
                                className="min-h-24 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm"
                                placeholder="Улица, дом, подъезд, этаж, домофон…"
                                required
                            />
                        </div>
                    )}

                    <fieldset className="mb-5">
                        <legend className="mb-2 text-sm font-medium">Способ оплаты *</legend>
                        <div className="space-y-2 text-sm">
                            {(
                                [
                                    ["cash", "Наличными"],
                                    ["card", "Картой (Visa и MasterCard)"],
                                ] as const
                            ).map(([value, label]) => (
                                <label
                                    key={value}
                                    className={`flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 hover:bg-[var(--background)] ${
                                        value === "card" && deliveryMethod === "belarus_courier" ? "opacity-40" : ""
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="payment_method"
                                        value={value}
                                        checked={paymentMethod === value}
                                        disabled={value === "card" && deliveryMethod === "belarus_courier"}
                                        onChange={() => setPaymentMethod(value)}
                                        className="mt-1"
                                    />
                                    <span>{label}</span>
                                </label>
                            ))}
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{PAYMENT_HINTS[paymentMethod]}</p>
                    </fieldset>

                    <div className="mb-5">
                        <label className="mb-2 block text-sm font-medium">Комментарий</label>
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="min-h-28 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-soft)]"
                            placeholder="Комментарий к заказу"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isPending || !phoneIsValid}
                        className="rounded-xl bg-[var(--accent)] px-5 py-3 text-white disabled:opacity-50"
                    >
                        {isPending ? "Оформление..." : "Подтвердить заказ"}
                    </button>

                    {errorMessage && (
                        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {errorMessage}
                        </div>
                    )}
                </form>

                <aside className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
                    <div className="mb-4 text-lg font-medium">Ваш заказ</div>

                    <div className="space-y-4">
                        {cart.items.map((item) => (
                            <div key={item.id} className="border-b border-[var(--line)] pb-4 last:border-b-0">
                                <div className="text-sm text-[var(--text-secondary)]">{item.brand_name || "—"}</div>
                                <div className="font-medium">{item.product_name}</div>
                                <div className="text-sm text-[var(--text-secondary)]">
                                    {item.variant?.display_name || item.variant?.title}
                                </div>
                                <div className="mt-1 text-sm text-[var(--text-secondary)]">
                                    {item.qty} × {item.price} руб.
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 border-t border-[var(--line)] pt-4">
                        {quoteError ? <p className="mb-2 text-xs text-amber-700">{quoteError}</p> : null}
                        <CartPricingBreakdown
                            itemsQty={cart.qty}
                            subtotal={quote?.subtotal ?? cart.subtotal}
                            total={merchandisePayStr}
                            discountCard={discountCardForBreakdown}
                            giftCertificate={giftForBreakdown}
                            showDeliveryNote={!quote}
                            deliveryFee={quote?.delivery_fee}
                            grandTotal={quote?.total}
                        />
                    </div>

                    {cardInCheckout ? (
                        <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
                            Карта <span className="font-mono text-[var(--foreground)]">{cardInCheckout.number}</span> в корзине.
                            {paymentMethod === "card"
                                ? " При оплате картой процент скидки к заказу не применяется."
                                : " Процент и сумма скидки — см. блок выше (пересчёт при оформлении)."}
                        </p>
                    ) : null}
                </aside>
            </div>
        </main>
    );
}

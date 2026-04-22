"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition, useState } from "react";
import { createOrder } from "@/lib/checkout-api";
import { useCart } from "@/components/cart/cart-provider";
import { useAuth } from "@/components/auth/auth-provider";
import PhoneInput, { isBelarusPhoneComplete } from "@/components/ui/phone-input";

export default function CheckoutPage() {
    const router = useRouter();
    const { cart, setCartState } = useCart();
    const { user } = useAuth();

    const [customerName, setCustomerName] = useState("");
    const [phone, setPhone] = useState("");
    const [comment, setComment] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        if (!phone && user?.phone) {
            setPhone(user.phone);
        }
    }, [user?.phone, phone]);

    const phoneIsValid = isBelarusPhoneComplete(phone);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        setErrorMessage("");

        if (!phoneIsValid) {
            setErrorMessage("Введите корректный номер: +375 (25/29/33/44) XXX-XX-XX");
            return;
        }

        startTransition(async () => {
            try {
                const response = await createOrder({
                    customer_name: customerName,
                    phone,
                    comment,
                });

                setCartState({
                    id: cart?.id ?? 0,
                    token: cart?.token ?? "",
                    qty: 0,
                    subtotal: "0.00",
                    total: "0.00",
                    items: [],
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

                                {item.variant?.type && (
                                    <div className="text-xs text-[var(--text-secondary)]">{item.variant.type}</div>
                                )}

                                <div className="mt-1 text-sm text-[var(--text-secondary)]">
                                    {item.qty} × {item.price} руб.
                                </div>

                                {item.old_price && (
                                    <div className="text-xs text-[var(--text-secondary)] line-through">
                                        {item.old_price} руб.
                                    </div>
                                )}

                                {item.is_available ? (
                                    item.is_preorder ? (
                                        <div className="mt-1 text-xs text-amber-700">Под заказ</div>
                                    ) : (
                                        <div className="mt-1 text-xs text-green-700">
                                            В наличии: {item.stock}
                                        </div>
                                    )
                                ) : (
                                    <div className="mt-1 text-xs text-red-700">Нет в наличии</div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 border-t border-[var(--line)] pt-4">
                        <div className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
                            <span>Товаров</span>
                            <span>{cart.qty}</span>
                        </div>

                        <div className="mt-2 flex items-center justify-between text-lg font-semibold">
                            <span>Итого</span>
                            <span>{cart.total} руб.</span>
                        </div>
                    </div>
                </aside>
            </div>
        </main>
    );
}
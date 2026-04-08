"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createOrder } from "@/lib/checkout-api";
import { useCart } from "@/components/cart/cart-provider";

export default function CheckoutPage() {
    const { cart, setCartState } = useCart();
    const [customerName, setCustomerName] = useState("");
    const [phone, setPhone] = useState("");
    const [comment, setComment] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isPending, startTransition] = useTransition();

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();

        setSuccessMessage("");
        setErrorMessage("");

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
                    items: [],
                });

                setSuccessMessage(`Заказ #${response.data.id} успешно оформлен`);
                setCustomerName("");
                setPhone("");
                setComment("");
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
                <p className="mb-6 text-gray-600">Корзина пуста.</p>
                <Link href="/catalog" className="inline-block rounded-xl border px-4 py-2">
                    Перейти в каталог
                </Link>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
            <h1 className="mb-8 text-3xl font-semibold">Оформление заказа</h1>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
                <form onSubmit={handleSubmit} className="rounded-2xl border p-5">
                    <div className="mb-5">
                        <label className="mb-2 block text-sm font-medium">Имя</label>
                        <input
                            type="text"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            className="w-full rounded-xl border px-4 py-3 outline-none"
                            placeholder="Ваше имя"
                        />
                    </div>

                    <div className="mb-5">
                        <label className="mb-2 block text-sm font-medium">Телефон *</label>
                        <input
                            type="text"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full rounded-xl border px-4 py-3 outline-none"
                            placeholder="+375..."
                            required
                        />
                    </div>

                    <div className="mb-5">
                        <label className="mb-2 block text-sm font-medium">Комментарий</label>
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="min-h-28 w-full rounded-xl border px-4 py-3 outline-none"
                            placeholder="Комментарий к заказу"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isPending}
                        className="rounded-xl bg-black px-5 py-3 text-white disabled:opacity-50"
                    >
                        {isPending ? "Оформление..." : "Подтвердить заказ"}
                    </button>

                    {successMessage && (
                        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                            {successMessage}
                        </div>
                    )}

                    {errorMessage && (
                        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {errorMessage}
                        </div>
                    )}
                </form>

                <aside className="rounded-2xl border p-5">
                    <div className="mb-4 text-lg font-medium">Ваш заказ</div>

                    <div className="space-y-4">
                        {cart.items.map((item) => (
                            <div key={item.id} className="border-b pb-4 last:border-b-0">
                                <div className="text-sm text-gray-500">{item.product?.brand}</div>
                                <div className="font-medium">{item.product?.name}</div>
                                <div className="text-sm text-gray-600">{item.variant?.title}</div>
                                <div className="text-sm text-gray-600">
                                    {item.qty} × {item.price} руб.
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 border-t pt-4">
                        <div className="flex items-center justify-between text-sm text-gray-600">
                            <span>Товаров</span>
                            <span>{cart.qty}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-lg font-semibold">
                            <span>Итого</span>
                            <span>{cart.subtotal} руб.</span>
                        </div>
                    </div>
                </aside>
            </div>
        </main>
    );
}
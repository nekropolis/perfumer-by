"use client";

import Link from "next/link";
import { useTransition } from "react";
import { removeCartItem, updateCartItem } from "@/lib/cart-api";
import { useCart } from "@/components/cart/cart-provider";

export default function CartPage() {
    const { cart, loading, setCartState } = useCart();
    const [isPending, startTransition] = useTransition();

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
        });
    };

    if (loading) {
        return <main className="max-w-5xl mx-auto px-6 py-10">Загрузка корзины...</main>;
    }

    if (!cart || cart.items.length === 0) {
        return (
            <main className="max-w-5xl mx-auto px-6 py-10">
                <h1 className="text-3xl font-semibold mb-6">Корзина</h1>
                <p className="text-gray-600 mb-6">Корзина пуста.</p>
                <Link href="/catalog" className="border rounded-xl px-4 py-2 inline-block">
                    Перейти в каталог
                </Link>
            </main>
        );
    }

    return (
        <main className="max-w-5xl mx-auto px-6 py-10">
            <h1 className="text-3xl font-semibold mb-8">Корзина</h1>

            <div className="space-y-4 mb-8">
                {cart.items.map((item) => (
                    <div key={item.id} className="border rounded-2xl p-5">
                        <div className="text-sm text-gray-500 mb-1">{item.product?.brand}</div>

                        <div className="text-lg font-medium mb-1">
                            <Link href={`/product/${item.product?.slug}`}>
                                {item.product?.name}
                            </Link>
                        </div>

                        <div className="text-sm text-gray-600 mb-3">{item.variant?.title}</div>

                        <div className="flex flex-wrap items-center gap-4">
                            <div className="text-sm">Цена: {item.price} руб.</div>
                            <div className="text-sm">Сумма: {item.total} руб.</div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    className="border rounded px-3 py-1"
                                    onClick={() => changeQty(item.id, item.qty - 1)}
                                    disabled={isPending || item.qty <= 1}
                                >
                                    -
                                </button>

                                <span>{item.qty}</span>

                                <button
                                    type="button"
                                    className="border rounded px-3 py-1"
                                    onClick={() => changeQty(item.id, item.qty + 1)}
                                    disabled={isPending}
                                >
                                    +
                                </button>
                            </div>

                            <button
                                type="button"
                                className="text-sm underline"
                                onClick={() => deleteItem(item.id)}
                                disabled={isPending}
                            >
                                Удалить
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="border rounded-2xl p-5">
                <div className="text-lg font-medium mb-2">Итого</div>
                <div className="text-2xl font-semibold mb-4">{cart.subtotal} руб.</div>

                <button
                    type="button"
                    className="rounded-xl px-5 py-3 border bg-black text-white"
                >
                    Перейти к оформлению
                </button>
            </div>
        </main>
    );
}
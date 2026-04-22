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
        return (
            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <div className="text-sm text-[var(--text-secondary)]">Загрузка корзины...</div>
            </main>
        );
    }

    if (!cart || cart.items.length === 0) {
        return (
            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <div className="mb-6">
                    <h1 className="text-3xl font-semibold sm:text-4xl">Корзина</h1>
                </div>

                <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] px-6 py-10 text-center sm:px-8">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--background)] text-[var(--text-secondary)]">
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
                    <p className="mx-auto mb-6 max-w-md text-sm leading-6 text-[var(--text-secondary)]">
                        Добавьте товары в корзину, чтобы оформить заказ и сохранить выбранные ароматы.
                    </p>

                    <Link
                        href="/catalog"
                        className="inline-flex items-center justify-center rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-95"
                    >
                        Перейти в каталог
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-7xl px-4 py-8 pb-28 sm:px-6 lg:px-8 lg:pb-8">
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-3xl font-semibold sm:text-4xl">Корзина</h1>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        {cart.qty} {cart.qty === 1 ? "товар" : cart.qty < 5 ? "товара" : "товаров"} в заказе
                    </p>
                </div>

                <Link
                    href="/catalog"
                    className="inline-flex items-center rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--background)]"
                >
                    Продолжить покупки
                </Link>
            </div>

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="space-y-4">
                    {cart.items.map((item) => (
                        <article
                            key={item.id}
                            className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm sm:p-5"
                        >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 flex-1">
                                    <div className="mb-1 text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                                        {item.brand_name || "—"}
                                    </div>

                                    <Link
                                        href={`/product/${item.product_slug}`}
                                        className="block text-lg font-medium leading-6 text-[var(--foreground)] transition hover:opacity-80"
                                    >
                                        {item.product_name}
                                    </Link>

                                    <div className="mt-1 text-sm text-[var(--text-secondary)]">
                                        {item.variant?.display_name || item.variant?.title}
                                    </div>

                                    {item.variant?.type && (
                                        <div className="mt-1 text-xs text-[var(--text-secondary)]">
                                            {item.variant.type}
                                        </div>
                                    )}

                                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                                        <div className="font-medium text-[var(--foreground)]">
                                            {item.price} руб.
                                            {item.old_price && (
                                                <span className="ml-2 font-normal text-[var(--text-secondary)] line-through">
                                                    {item.old_price} руб.
                                                </span>
                                            )}
                                        </div>

                                        {item.is_available ? (
                                            item.is_preorder ? (
                                                <div className="text-amber-700">Под заказ</div>
                                            ) : (
                                                <div className="text-green-700">
                                                    В наличии: {item.stock}
                                                </div>
                                            )
                                        ) : (
                                            <div className="text-red-700">Нет в наличии</div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end">
                                    <div className="flex items-center rounded-2xl border border-[var(--line)] bg-[var(--background)]">
                                        <button
                                            type="button"
                                            onClick={() => changeQty(item.id, item.qty - 1)}
                                            disabled={isPending || item.qty <= 1}
                                            className="inline-flex h-10 w-10 items-center justify-center rounded-l-2xl text-base text-[var(--foreground)] transition hover:bg-[var(--surface)] disabled:opacity-40"
                                        >
                                            −
                                        </button>

                                        <span className="inline-flex min-w-[36px] items-center justify-center text-sm font-medium">
                                            {item.qty}
                                        </span>

                                        <button
                                            type="button"
                                            onClick={() => changeQty(item.id, item.qty + 1)}
                                            disabled={isPending}
                                            className="inline-flex h-10 w-10 items-center justify-center rounded-r-2xl text-base text-[var(--foreground)] transition hover:bg-[var(--surface)] disabled:opacity-40"
                                        >
                                            +
                                        </button>
                                    </div>

                                    <div className="text-right">
                                        <div className="text-base font-semibold text-[var(--foreground)]">
                                            {item.total} руб.
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => deleteItem(item.id)}
                                            disabled={isPending}
                                            className="mt-2 text-sm text-[var(--text-secondary)] transition hover:text-[var(--foreground)] disabled:opacity-40"
                                        >
                                            Удалить
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </article>
                    ))}
                </section>

                <aside className="self-start xl:sticky xl:top-24">
                    <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
                        <div className="mb-5 text-xl font-semibold">Ваш заказ</div>

                        <div className="space-y-3 text-sm text-[var(--text-secondary)]">
                            <div className="flex items-center justify-between">
                                <span>Товаров</span>
                                <span>{cart.qty}</span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span>Сумма товаров</span>
                                <span>{cart.subtotal} руб.</span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span>Доставка</span>
                                <span>По тарифам</span>
                            </div>
                        </div>

                        <div className="mt-5 border-t border-[var(--line)] pt-4">
                            <div className="flex items-end justify-between gap-4">
                                <div>
                                    <div className="text-sm text-[var(--text-secondary)]">Итого</div>
                                    <div className="mt-1 text-3xl font-semibold leading-none">
                                        {cart.total ?? cart.subtotal} руб.
                                    </div>
                                </div>
                            </div>
                        </div>

                        <Link
                            href="/checkout"
                            className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-[var(--accent)] px-5 py-4 text-base font-medium text-white transition-all duration-150 hover:-translate-y-[1px] hover:opacity-95 active:translate-y-0 active:scale-[0.99]"
                        >
                            Перейти к оформлению
                        </Link>

                        <div className="mt-4 text-xs leading-5 text-[var(--text-secondary)]">
                            После оформления заказа мы свяжемся с вами для подтверждения деталей доставки и оплаты.
                        </div>
                    </div>
                </aside>
            </div>

            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur md:hidden">
                <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                        <div className="text-xs text-[var(--text-secondary)]">Итого</div>
                        <div className="truncate text-lg font-semibold">
                            {cart.total ?? cart.subtotal} руб.
                        </div>
                    </div>

                    <Link
                        href="/checkout"
                        className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-medium text-white"
                    >
                        Оформить
                    </Link>
                </div>
            </div>
        </main>
    );
}
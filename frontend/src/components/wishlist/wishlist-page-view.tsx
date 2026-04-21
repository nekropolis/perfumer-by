"use client";

import Link from "next/link";
import ProductCard from "@/components/product/product-card";
import { useWishlist } from "@/components/wishlist/wishlist-provider";

export default function WishlistPageView() {
    const { products, loading, wishlistQty, removeFromWishlist } = useWishlist();

    return (
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-6 flex items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-black">Избранное</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        {wishlistQty > 0 ? `Товаров в избранном: ${wishlistQty}` : "Список пока пуст"}
                    </p>
                </div>
                <Link
                    href="/catalog"
                    className="rounded-2xl border bg-white px-4 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-50"
                >
                    В каталог
                </Link>
            </div>

            {loading ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
                    Загружаем избранное...
                </div>
            ) : products.length === 0 ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
                    Добавляйте товары в избранное, чтобы быстро возвращаться к ним позже.
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {products.map((product, index) => (
                        <div key={product.id} className="relative">
                            <ProductCard product={product} showBrand eager={index < 4} />
                            <button
                                type="button"
                                onClick={() => void removeFromWishlist(product.id)}
                                className="absolute right-3 top-3 rounded-full border border-white/70 bg-white/95 px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-white hover:text-black"
                            >
                                Убрать
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </main>
    );
}

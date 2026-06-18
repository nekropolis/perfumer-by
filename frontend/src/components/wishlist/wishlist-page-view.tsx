"use client";

import Link from "next/link";
import ProductCardClient from "@/components/product/product-card.client";
import { useWishlist } from "@/components/wishlist/wishlist-provider";
import { siteBtnSecondary, siteCard } from "@/lib/site-ui-classes";

export default function WishlistPageView() {
    const { products, loading, wishlistQty } = useWishlist();

    return (
        <main className="min-h-screen bg-admin-bg text-admin-text">
            <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <div className="mb-6 flex items-end justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">Избранное</h1>
                        <p className="mt-1 text-sm text-admin-text-secondary">
                            {wishlistQty > 0 ? `Товаров в избранном: ${wishlistQty}` : "Список пока пуст"}
                        </p>
                    </div>
                    <Link href="/catalog" className={siteBtnSecondary}>
                        В каталог
                    </Link>
                </div>

                {loading ? (
                    <div className={`${siteCard} p-6 text-sm text-admin-text-secondary`}>
                        Загружаем избранное...
                    </div>
                ) : products.length === 0 ? (
                    <div className={`${siteCard} p-6 text-sm text-admin-text-secondary`}>
                        Добавляйте товары в избранное, чтобы быстро возвращаться к ним позже.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                        {products.map((product) => (
                            <ProductCardClient key={product.id} product={product} />
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}

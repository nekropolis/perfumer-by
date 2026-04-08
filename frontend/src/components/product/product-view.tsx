"use client";

import { useMemo, useState, useTransition } from "react";
import { addToCart } from "@/lib/cart-api";
import type { ProductDetail, ProductVariant } from "@/types/catalog";
import { useCart } from "@/components/cart/cart-provider";

type Props = {
    product: ProductDetail;
};

export default function ProductView({ product }: Props) {
    const [selectedVariantId, setSelectedVariantId] = useState<number | null>(
        product.variants[0]?.id ?? null
    );
    const [message, setMessage] = useState<string>("");
    const [isPending, startTransition] = useTransition();

    const { refreshCart } = useCart();

    const selectedVariant = useMemo<ProductVariant | null>(() => {
        return product.variants.find((variant) => variant.id === selectedVariantId) ?? null;
    }, [product.variants, selectedVariantId]);

    const mainImage =
        product.images.find((image) => image.is_main) ?? product.images[0] ?? null;

    const handleAddToCart = () => {
        if (!selectedVariant) {
            return;
        }

        setMessage("");

        startTransition(async () => {
            try {
                await addToCart(selectedVariant.id, 1);
                await refreshCart();
                setMessage("Товар добавлен в корзину");
            } catch (error) {
                console.error(error);
                setMessage("Ошибка при добавлении в корзину");
            }
        });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div>
                <div className="border rounded-2xl p-8 min-h-[400px]">
                    {mainImage ? (
                        <div>
                            <div className="text-sm text-gray-500 mb-2">Изображение</div>
                            <div className="break-all text-sm">{mainImage.path}</div>
                        </div>
                    ) : (
                        <div>Нет изображения</div>
                    )}
                </div>
            </div>

            <div>
                <div className="text-sm text-gray-500 mb-2">{product.brand?.name}</div>
                <h1 className="text-3xl font-semibold mb-4">{product.h1 || product.name}</h1>

                {product.short_description && (
                    <p className="text-gray-600 mb-6">{product.short_description}</p>
                )}

                <div className="mb-8">
                    <div className="text-lg font-medium mb-3">Выберите вариант</div>

                    <div className="space-y-3">
                        {product.variants.map((variant) => {
                            const isSelected = variant.id === selectedVariantId;

                            return (
                                <button
                                    key={variant.id}
                                    type="button"
                                    onClick={() => setSelectedVariantId(variant.id)}
                                    className={`w-full text-left border rounded-xl p-4 transition ${
                                        isSelected ? "border-black shadow-sm" : "border-gray-200"
                                    }`}
                                >
                                    <div className="font-medium mb-2">{variant.title}</div>

                                    <div className="flex items-center gap-3 flex-wrap">
                                        <span className="text-lg font-semibold">{variant.price} руб.</span>

                                        {variant.old_price && (
                                            <span className="text-sm text-gray-400 line-through">
                        {variant.old_price} руб.
                      </span>
                                        )}

                                        {variant.discount_percent && (
                                            <span className="text-xs border rounded-full px-2 py-1">
                        -{variant.discount_percent}%
                      </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {selectedVariant && (
                    <div className="border rounded-2xl p-5 mb-8">
                        <div className="text-sm text-gray-500 mb-2">Выбранный вариант</div>
                        <div className="text-xl font-semibold mb-3">{selectedVariant.title}</div>

                        <div className="flex items-center gap-3 mb-3 flex-wrap">
                            <span className="text-2xl font-semibold">{selectedVariant.price} руб.</span>

                            {selectedVariant.old_price && (
                                <span className="text-base text-gray-400 line-through">
                  {selectedVariant.old_price} руб.
                </span>
                            )}

                            {selectedVariant.discount_percent && (
                                <span className="text-xs border rounded-full px-2 py-1">
                  -{selectedVariant.discount_percent}%
                </span>
                            )}
                        </div>

                        <div className="space-y-1 text-sm text-gray-600 mb-4">
                            <div>SKU: {selectedVariant.sku || "—"}</div>
                            <div>Остаток: {selectedVariant.stock}</div>
                            <div>
                                Статус:{" "}
                                {selectedVariant.stock > 0
                                    ? "В наличии"
                                    : selectedVariant.is_preorder
                                        ? "Предзаказ"
                                        : "Нет в наличии"}
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                className="rounded-xl px-5 py-3 border bg-black text-white disabled:opacity-50"
                                disabled={
                                    isPending ||
                                    (selectedVariant.stock <= 0 && !selectedVariant.is_preorder)
                                }
                                onClick={handleAddToCart}
                            >
                                {isPending ? "Добавление..." : "Добавить в корзину"}
                            </button>

                            {message && <span className="text-sm text-gray-600">{message}</span>}
                        </div>
                    </div>
                )}

                {product.description && (
                    <div>
                        <h2 className="text-xl font-medium mb-3">Описание</h2>
                        <div className="text-gray-700 whitespace-pre-line">{product.description}</div>
                    </div>
                )}
            </div>
        </div>
    );
}

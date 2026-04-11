"use client";

import {useMemo, useState} from "react";
import type {ProductDetailData, ProductVariantData} from "@/types/catalog";
import {useTransition} from "react";
import {addToCart} from "@/lib/cart-api";
import {useCart} from "@/components/cart/cart-provider";
import Breadcrumbs from "@/components/ui/breadcrumbs";

type Props = {
    product: ProductDetailData;
};

function formatPrice(price: string | null) {
    if (!price) return "—";
    return `${price} BYN`;
}

function getMainImage(product: ProductDetailData) {
    return product.images.find((image) => image.is_main) || product.images[0] || null;
}

export default function ProductDetailView({product}: Props) {
    const [isPending, startTransition] = useTransition();
    const [activeTab, setActiveTab] = useState<"attributes" | "description">("attributes");
    const {setCartState} = useCart();

    const defaultVariant =
        product.variants.find((variant) => variant.id === product.default_variant_id) ||
        product.variants[0] ||
        null;

    const [selectedVariantId, setSelectedVariantId] = useState<number | null>(
        defaultVariant?.id ?? null
    );

    const selectedVariant = useMemo<ProductVariantData | null>(() => {
        return product.variants.find((variant) => variant.id === selectedVariantId) || null;
    }, [product.variants, selectedVariantId]);

    const mainImage = getMainImage(product);

    const handleAddToCart = () => {
        if (!selectedVariant?.id) return;

        startTransition(async () => {
            try {
                const response = await addToCart(selectedVariant.id, 1);
                setCartState(response.data);
            } catch (error) {
                console.error(error);
            }
        });
    };

    return (
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <Breadcrumbs
                className="mb-4"
                items={[
                    {label: "Главная", href: "/"},
                    {label: "Каталог", href: "/catalog"},
                    ...(product.brand
                        ? [{ label: product.brand!.name, href: `/brands/${product.brand!.slug}` }]
                        : []),
                    {label: product.name},
                ]}
            />


            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[420px_minmax(0,1fr)]">
                <section>
                    <div className="overflow-hidden rounded-3xl border bg-white lg:max-w-[420px]">
                        {mainImage ? (
                            <img
                                src={`/${mainImage.path}`}
                                alt={product.name}
                                className="aspect-[4/5] h-auto w-full object-cover"
                            />
                        ) : (
                            <div className="flex aspect-[4/5] items-center justify-center text-gray-400">
                                Нет изображения
                            </div>
                        )}
                    </div>
                </section>

                <section>
                    <div className="mb-2 text-sm text-gray-500">Код товара: #{product.id}</div>

                    <h1 className="mb-5 text-3xl font-semibold">
                        {product.h1 || product.name}
                    </h1>

                    {selectedVariant && (
                        <div className="mb-6 flex flex-wrap items-end gap-3">
                            {selectedVariant.old_price && (
                                <div className="text-lg text-gray-400 line-through">
                                    {formatPrice(selectedVariant.old_price)}
                                </div>
                            )}

                            <div className="text-3xl font-semibold">
                                {selectedVariant.price ? formatPrice(selectedVariant.price) : "Предзаказ"}
                            </div>

                            {selectedVariant.discount_percent && (
                                <div className="rounded-full border px-3 py-1 text-sm">
                                    -{selectedVariant.discount_percent}%
                                </div>
                            )}
                        </div>
                    )}

                    <div className="mb-6">
                        <div className="flex flex-wrap gap-2">
                            {product.variants.map((variant) => {
                                const isSelected = variant.id === selectedVariantId;

                                let availabilityText = "Нет в наличии";
                                let availabilityClass = isSelected ? "text-white/80" : "text-red-600";

                                if (variant.is_available) {
                                    if (variant.is_preorder) {
                                        availabilityText = "Предзаказ";
                                        availabilityClass = isSelected ? "text-white/80" : "text-amber-600";
                                    } else {
                                        availabilityText = "В наличии";
                                        availabilityClass = isSelected ? "text-white/80" : "text-green-600";
                                    }
                                }

                                return (
                                    <button
                                        key={variant.id}
                                        type="button"
                                        onClick={() => setSelectedVariantId(variant.id)}
                                        className={`min-w-[150px] rounded-2xl border px-4 py-3 text-left text-sm transition ${
                                            isSelected
                                                ? "border-black bg-black text-white"
                                                : "hover:bg-gray-50"
                                        }`}
                                    >
                                        <div className="font-medium">{variant.display_name}</div>
                                        {variant.price && (
                                            <div
                                                className={`mt-1 text-xs ${isSelected ? "text-white/80" : "text-gray-500"}`}>
                                                {formatPrice(variant.price)} <span
                                                className={`mt-1 text-xs ${availabilityClass}`}>
                                                    {availabilityText}
                                                </span>
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="mb-8">
                        <button
                            type="button"
                            onClick={handleAddToCart}
                            disabled={!selectedVariant || !selectedVariant.is_available || isPending}
                            className="rounded-2xl bg-black px-6 py-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isPending ? "Добавление..." : "Добавить в корзину"}
                        </button>
                    </div>

                </section>
            </div>
            <div className="mt-8 rounded-2xl border">
                <div className="flex border-b">
                    <button
                        type="button"
                        onClick={() => setActiveTab("attributes")}
                        className={`px-5 py-3 text-sm font-medium ${
                            activeTab === "attributes"
                                ? "border-b-2 border-black text-black"
                                : "text-gray-500"
                        }`}
                    >
                        Характеристики
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab("description")}
                        className={`px-5 py-3 text-sm font-medium ${
                            activeTab === "description"
                                ? "border-b-2 border-black text-black"
                                : "text-gray-500"
                        }`}
                    >
                        Описание
                    </button>
                </div>

                <div className="p-5">
                    {activeTab === "attributes" && (
                        product.attributes.length > 0 ? (
                            <div className="space-y-3">
                                {product.attributes.map((attribute) => (
                                    <div
                                        key={attribute.id}
                                        className="grid grid-cols-1 gap-1 border-b pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[180px_1fr] sm:gap-4"
                                    >
                                        <div className="text-sm text-gray-500">{attribute.name}</div>
                                        <div className="text-sm">{attribute.value}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-sm text-gray-500">Характеристики отсутствуют</div>
                        )
                    )}

                    {activeTab === "description" && (
                        product.description ? (
                            <div className="whitespace-pre-line text-sm text-gray-700">
                                {product.description}
                            </div>
                        ) : (
                            <div className="text-sm text-gray-500">Описание отсутствует</div>
                        )
                    )}
                </div>
            </div>

        </main>
    );
}
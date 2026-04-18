"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { ProductDetailData, ProductVariantData } from "@/types/catalog";
import { useTransition } from "react";
import { addToCart } from "@/lib/cart-api";
import { useCart } from "@/components/cart/cart-provider";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import CopyText from "@/components/ui/copy-text";
import ProductBuyBox from "@/components/product/product-buy-box";
import ProductServiceInfo from "@/components/product/product-service-info";

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

export default function ProductDetailView({ product }: Props) {
    const [isPending, startTransition] = useTransition();
    const [activeTab, setActiveTab] = useState<"attributes" | "description">("attributes");
    const { setCartState } = useCart();

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

    const mainImageUrl =
        mainImage == null
            ? null
            : mainImage.path.startsWith("http")
                ? mainImage.path
                : `/${mainImage.path.replace(/^\/+/, "")}`;

    const mainImageIsRemote = Boolean(
        mainImageUrl?.startsWith("http://") || mainImageUrl?.startsWith("https://")
    );

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
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
            <Breadcrumbs
                className="mb-4"
                items={[
                    { label: "Главная", href: "/" },
                    { label: "Каталог", href: "/catalog" },
                    ...(product.brand
                        ? [{ label: product.brand.name, href: `/brands/${product.brand.slug}` }]
                        : []),
                    { label: product.name },
                ]}
            />

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-[320px_minmax(0,1fr)_340px] xl:items-start">
                <section>
                    <div className="relative aspect-square overflow-hidden rounded-3xl border bg-white shadow-sm">
                        {mainImageUrl ? (
                            <Image
                                src={mainImageUrl}
                                alt={product.name}
                                fill
                                priority
                                sizes="(max-width: 1280px) 100vw, 320px"
                                className="object-cover"
                                unoptimized={mainImageIsRemote}
                            />
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 text-gray-400">
                                <div className="mb-4 rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.5"
                                        className="h-12 w-12"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M2.25 15.75l4.159-4.159a2.25 2.25 0 013.182 0l.409.409a2.25 2.25 0 003.182 0l2.659-2.659a2.25 2.25 0 013.182 0l2.727 2.727M3.75 19.5h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z"
                                        />
                                    </svg>
                                </div>

                                <div className="text-base font-medium text-gray-500">Фото появится позже</div>
                                <div className="mt-1 text-sm text-gray-400">Изображение товара загружается</div>
                            </div>
                        )}
                    </div>
                </section>

                <section className="min-w-0">
                    <div className="mb-2 flex items-center gap-1 text-sm text-gray-500">
                        <span>Код товара:</span>
                        <CopyText
                            value={String(product.id)}
                            label={`${product.id}`}
                            title="Скопировать код товара"
                        />
                    </div>

                    <h1 className="mb-5 text-3xl font-semibold leading-tight sm:text-4xl">
                        {product.h1 || product.name}
                    </h1>


                    {product.variants.length > 0 ? (
                        <>

                            <div className="mb-3 text-sm font-medium text-gray-700">Выбор вариантов</div>
                            <div className="mb-6 rounded-3xl bg-gray-100 p-3">
                                <div className="flex flex-wrap gap-2">
                                    {product.variants.map((variant) => {
                                        const isSelected = variant.id === selectedVariantId;

                                        let availabilityText = "Нет";
                                        let availabilityClass = "text-red-500";

                                        if (variant.is_available) {
                                            if (variant.is_preorder) {
                                                availabilityText = "Предзаказ";
                                                availabilityClass = "text-amber-600";
                                            } else {
                                                availabilityText = "В наличии";
                                                availabilityClass = "text-green-600";
                                            }
                                        }

                                        return (
                                            <button
                                                key={variant.id}
                                                type="button"
                                                onClick={() => setSelectedVariantId(variant.id)}
                                                className={`group cursor-pointer rounded-2xl border px-3.5 py-2.5 text-left transition-all duration-150 ${isSelected
                                                    ? "bg-white border-black shadow-sm ring-1 ring-black/10"
                                                    : "bg-white/70 border-gray-200 hover:bg-white hover:border-gray-300 hover:-translate-y-[1px] active:scale-[0.97]"
                                                    }`}
                                            >
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-sm font-medium leading-5">
                                                        {variant.display_name}
                                                    </span>

                                                    <div className="flex items-center gap-2">
                                                        {variant.price && (
                                                            <span className="text-xs text-gray-500 group-hover:text-gray-700">
                                                                {formatPrice(variant.price)}
                                                            </span>
                                                        )}

                                                        <span className={`text-xs ${availabilityClass}`}>
                                                            {availabilityText}
                                                        </span>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50/60 p-5">
                            <div className="mb-2 text-2xl font-semibold leading-tight text-amber-900">
                                Ожидается поступление
                            </div>
                            <p className="text-sm leading-6 text-amber-900/80">
                                Пока у нас нет точных данных о сроках поставки и актуальной цене на этот аромат.
                                Заполните форму «Сообщить о появлении» — мы с Вами свяжемся, как только товар появится
                                в наличии, и подскажем стоимость.
                            </p>
                        </div>
                    )}

                </section>

                <aside className="self-start xl:sticky xl:top-24">
                    <ProductBuyBox
                        selectedVariant={selectedVariant}
                        isPending={isPending}
                        onAddToCart={handleAddToCart}
                        formatPrice={formatPrice}
                        productId={product.id}
                        productName={product.name}
                    />
                </aside>

                <section className="xl:col-span-2">
                    <ProductServiceInfo />
                </section>

                <section className="min-w-0 xl:col-span-2">
                    <div className="rounded-3xl border bg-white">
                        <div className="flex overflow-x-auto border-b">
                            <button
                                type="button"
                                onClick={() => setActiveTab("attributes")}
                                className={`shrink-0 px-6 py-4 text-sm font-medium ${activeTab === "attributes"
                                    ? "border-b-2 border-black text-black"
                                    : "text-gray-500"
                                    }`}
                            >
                                Характеристики
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab("description")}
                                className={`shrink-0 px-6 py-4 text-sm font-medium ${activeTab === "description"
                                    ? "border-b-2 border-black text-black"
                                    : "text-gray-500"
                                    }`}
                            >
                                Описание
                            </button>
                        </div>

                        <div className="p-5 sm:p-6">
                            {activeTab === "attributes" &&
                                (product.attribute_values.length > 0 ? (
                                    <div className="space-y-3">
                                        {product.attribute_values.map((item) => {
                                            const label = item.attribute?.name || "Характеристика";

                                            const valueText =
                                                item.selected_options.length > 0
                                                    ? item.selected_options.map((option) => option.name).join(", ")
                                                    : item.custom_value || "—";

                                            return (
                                                <div
                                                    key={item.id}
                                                    className="grid grid-cols-1 gap-1 border-b pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[180px_1fr] sm:gap-4"
                                                >
                                                    <div className="text-sm text-gray-500">{label}</div>
                                                    <div className="text-sm">{valueText}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-sm text-gray-500">Характеристики отсутствуют</div>
                                ))}

                            {activeTab === "description" &&
                                (product.description ? (
                                    <div className="whitespace-pre-line text-sm leading-6 text-gray-700">
                                        {product.description}
                                    </div>
                                ) : (
                                    <div className="text-sm text-gray-500">Описание отсутствует</div>
                                ))}
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}
import { apiFetch } from "@/lib/api";
import { ProductDetailResponse } from "@/types/catalog";

type Props = {
    params: Promise<{ slug: string }>;
};

export default async function ProductPage({ params }: Props) {
    const { slug } = await params;
    const response = await apiFetch<ProductDetailResponse>(`/catalog/products/${slug}`);
    const product = response.data;

    const mainImage =
        product.images.find((image) => image.is_main) ?? product.images[0] ?? null;

    return (
        <main className="max-w-6xl mx-auto px-6 py-10">
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

                    <div className="space-y-3 mb-8">
                        <div className="text-lg font-medium">Варианты</div>

                        {product.variants.map((variant) => (
                            <div key={variant.id} className="border rounded-xl p-4">
                                <div className="font-medium mb-2">{variant.title}</div>

                                <div className="flex items-center gap-3 mb-2">
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

                                <div className="text-sm text-gray-600">SKU: {variant.sku || "—"}</div>
                                <div className="text-sm text-gray-600">Остаток: {variant.stock}</div>
                            </div>
                        ))}
                    </div>

                    {product.description && (
                        <div>
                            <h2 className="text-xl font-medium mb-3">Описание</h2>
                            <div className="text-gray-700 whitespace-pre-line">
                                {product.description}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}

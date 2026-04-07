import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { ProductsResponse } from "@/types/catalog";

export default async function CatalogPage() {
    const products = await apiFetch<ProductsResponse>("/catalog/products");

    return (
        <main className="max-w-6xl mx-auto px-6 py-10">
            <h1 className="text-3xl font-semibold mb-8">Каталог</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {products.data.map((product) => (
                    <Link
                        key={product.id}
                        href={`/product/${product.slug}`}
                        className="border rounded-2xl p-5 hover:shadow-md transition block"
                    >
                        <div className="mb-4 text-sm text-gray-500">{product.brand}</div>

                        <div className="text-xl font-medium mb-2">{product.name}</div>

                        {product.short_description && (
                            <div className="text-sm text-gray-600 mb-4">
                                {product.short_description}
                            </div>
                        )}

                        <div className="flex items-center gap-3">
                            <span className="text-lg font-semibold">{product.min_price} руб.</span>
                            {product.old_price && (
                                <span className="text-sm text-gray-400 line-through">
                  {product.old_price} руб.
                </span>
                            )}
                        </div>

                        <div className="mt-4 flex gap-2">
                            {product.is_new && (
                                <span className="text-xs border rounded-full px-2 py-1">New</span>
                            )}
                            {product.is_hit && (
                                <span className="text-xs border rounded-full px-2 py-1">Hit</span>
                            )}
                        </div>
                    </Link>
                ))}
            </div>
        </main>
    );
}

import { apiFetch } from "@/lib/api";
import type { ProductDetailResponse } from "@/types/catalog";
import ProductView from "@/components/product/product-view";

type Props = {
    params: Promise<{ slug: string }>;
};

export default async function ProductPage({ params }: Props) {
    const { slug } = await params;
    const response = await apiFetch<ProductDetailResponse>(`/catalog/products/${slug}`);
    const product = response.data;

    return (
        <main className="max-w-6xl mx-auto px-6 py-10">
            <ProductView product={product} />
        </main>
    );
}
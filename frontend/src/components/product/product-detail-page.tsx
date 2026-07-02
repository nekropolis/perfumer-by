import Breadcrumbs from "@/components/ui/breadcrumbs";
import ProductDetailAttributes from "@/components/product/product-detail-attributes";
import ProductDetailDescription from "@/components/product/product-detail-description";
import ProductDetailInteractive from "@/components/product/product-detail-interactive";
import ProductSimilarSection from "@/components/product/product-similar-section";
import { getProductBreadcrumbItems } from "@/lib/product-breadcrumbs";
import { fetchSiteContent, DEFAULT_SITE_CONTENT } from "@/lib/site-content-api";
import type { ProductDetailData } from "@/types/catalog";
import type { ReviewItem } from "@/types/reviews";

type Props = {
    product: ProductDetailData;
    initialProductReviews?: ReviewItem[];
};

export default async function ProductDetailPage({ product, initialProductReviews }: Props) {
    let deliveryDate = DEFAULT_SITE_CONTENT.waiting_discount_delivery_date;
    try {
        const siteContent = await fetchSiteContent({ noCache: true });
        deliveryDate = siteContent.data.waiting_discount_delivery_date || deliveryDate;
    } catch {
        // fallback к дефолту
    }

    return (
        <main className="mx-auto max-w-7xl px-4 py-8 pb-28 sm:px-6 xl:pb-8">
            <Breadcrumbs className="mb-4" items={getProductBreadcrumbItems(product)} />
            <ProductDetailInteractive
                product={product}
                initialProductReviews={initialProductReviews}
                attributesContent={<ProductDetailAttributes product={product} />}
                descriptionContent={<ProductDetailDescription description={product.description} />}
                deliveryDate={deliveryDate}
            />
            <ProductSimilarSection slug={product.slug} />
        </main>
    );
}

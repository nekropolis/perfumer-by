import Breadcrumbs from "@/components/ui/breadcrumbs";
import ProductDetailAttributes from "@/components/product/product-detail-attributes";
import ProductDetailDescription from "@/components/product/product-detail-description";
import ProductDetailInteractive from "@/components/product/product-detail-interactive";
import RecentlyViewedTracker from "@/components/product/recently-viewed-tracker";
import ProductSimilarSection from "@/components/product/product-similar-section";
import { getProductBreadcrumbItems } from "@/lib/product-breadcrumbs";
import { fetchSiteContent, DEFAULT_SITE_CONTENT } from "@/lib/site-content-api";
import type { ProductDetailData } from "@/types/catalog";
import type { ReviewItem } from "@/types/reviews";

type Props = {
    product: ProductDetailData;
    initialProductReviews?: ReviewItem[];
    /** Всего опубликованных отзывов (список ограничен 50). */
    initialProductReviewsTotal?: number;
    variantFromQuery?: number;
};

export default async function ProductDetailPage({
    product,
    initialProductReviews,
    initialProductReviewsTotal,
    variantFromQuery = 0,
}: Props) {
    let deliveryDate = DEFAULT_SITE_CONTENT.waiting_discount_delivery_date;
    let deliveryInfo = {
        minskFreeThreshold: DEFAULT_SITE_CONTENT.delivery_minsk_free_threshold,
        belarusFee: DEFAULT_SITE_CONTENT.delivery_belarus_fee,
        belarusFreeMinLines: DEFAULT_SITE_CONTENT.delivery_belarus_free_min_lines,
    };
    try {
        const siteContent = await fetchSiteContent({ noCache: true });
        deliveryDate = siteContent.data.waiting_discount_delivery_date || deliveryDate;
        deliveryInfo = {
            minskFreeThreshold: siteContent.data.delivery_minsk_free_threshold,
            belarusFee: siteContent.data.delivery_belarus_fee,
            belarusFreeMinLines: siteContent.data.delivery_belarus_free_min_lines,
        };
    } catch {
        // fallback к дефолту
    }

    return (
        <main className="mx-auto max-w-7xl px-4 pb-28 pt-1.5 sm:px-6 md:py-8 xl:pb-8">
            <Breadcrumbs
                alwaysShow
                className="max-md:sr-only md:mb-4"
                items={getProductBreadcrumbItems(product)}
            />
            <ProductDetailInteractive
                product={product}
                initialProductReviews={initialProductReviews}
                initialProductReviewsTotal={initialProductReviewsTotal}
                attributesContent={<ProductDetailAttributes product={product} />}
                descriptionContent={<ProductDetailDescription description={product.description} />}
                deliveryDate={deliveryDate}
                deliveryInfo={deliveryInfo}
                variantFromQuery={variantFromQuery}
            />
            <ProductSimilarSection slug={product.slug} />
            <RecentlyViewedTracker product={product} />
        </main>
    );
}

"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { scheduleIdleTask } from "@/lib/schedule-idle-task";
import { SIMILAR_PRODUCTS_MIN_TO_SHOW } from "@/lib/product-detail-utils";
import type { ProductListItem } from "@/types/catalog";

const SimilarProductsCarousel = dynamic(() => import("@/components/product/similar-products-carousel"), {
    ssr: false,
});

type Props = {
    slug: string;
};

export default function ProductSimilarSection({ slug }: Props) {
    const [products, setProducts] = useState<ProductListItem[] | null>(null);

    useEffect(() => {
        let cancelled = false;

        const cancelIdle = scheduleIdleTask(() => {
            void apiFetch<{ data: ProductListItem[] }>(`/catalog/products/${encodeURIComponent(slug)}/similar`)
                .then((response) => {
                    if (!cancelled) {
                        setProducts(response.data ?? []);
                    }
                })
                .catch(() => {
                    if (!cancelled) {
                        setProducts([]);
                    }
                });
        });

        return () => {
            cancelled = true;
            cancelIdle();
        };
    }, [slug]);

    if (products === null || products.length < SIMILAR_PRODUCTS_MIN_TO_SHOW) {
        return null;
    }

    return <SimilarProductsCarousel products={products} />;
}

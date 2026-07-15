"use client";

import { useEffect } from "react";
import {
    addRecentlyViewedProduct,
    productDetailToRecentlyViewed,
} from "@/lib/recently-viewed-products";
import type { ProductDetailData } from "@/types/catalog";

type Props = {
    product: ProductDetailData;
};

export default function RecentlyViewedTracker({ product }: Props) {
    useEffect(() => {
        addRecentlyViewedProduct(productDetailToRecentlyViewed(product));
    }, [product]);

    return null;
}

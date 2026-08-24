"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { isStaffUser } from "@/constants/admin-roles";
import { recordCatalogProductView } from "@/lib/catalog-api";
import {
    addRecentlyViewedProduct,
    productDetailToRecentlyViewed,
} from "@/lib/recently-viewed-products";
import type { ProductDetailData } from "@/types/catalog";

type Props = {
    product: ProductDetailData;
};

export default function RecentlyViewedTracker({ product }: Props) {
    const { user, loading: authLoading } = useAuth();

    useEffect(() => {
        addRecentlyViewedProduct(productDetailToRecentlyViewed(product));
    }, [product]);

    useEffect(() => {
        if (authLoading || isStaffUser(user)) {
            return;
        }
        recordCatalogProductView(product.id);
    }, [authLoading, product.id, user]);

    return null;
}

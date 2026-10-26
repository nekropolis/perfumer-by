"use client";

import { Heart } from "lucide-react";
import { useWishlist } from "@/components/wishlist/wishlist-provider";

type Props = {
    productId: number;
};

export default function ProductCardWishlistButton({ productId }: Props) {
    const { isInWishlist, toggleWishlist } = useWishlist();
    const inWishlist = isInWishlist(productId);

    return (
        <button
            type="button"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void toggleWishlist(productId);
            }}
            aria-label={inWishlist ? "Убрать из избранного" : "Добавить в избранное"}
            className={`absolute right-1.5 top-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-150 active:scale-95 lg:hover:scale-110 ${inWishlist
                ? "border-admin-primary/30 bg-admin-primary text-white shadow-sm"
                : "border-admin-border bg-white/95 text-admin-text backdrop-blur lg:hover:bg-admin-muted"
                }`}
        >
            <Heart
                aria-hidden
                className={`h-4 w-4 ${inWishlist ? "fill-current" : ""}`}
                strokeWidth={1.75}
            />
        </button>
    );
}

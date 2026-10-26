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
            className={`absolute right-1.5 top-1.5 z-10 flex h-8 w-8 items-center justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)] transition active:scale-90 ${inWishlist ? "text-black" : "text-white"}`}
        >
            <Heart
                aria-hidden
                className={`h-5 w-5 ${inWishlist ? "fill-black" : "fill-transparent"}`}
                strokeWidth={2}
            />
        </button>
    );
}

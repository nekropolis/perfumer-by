"use client";

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
            className={`absolute right-1.5 top-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-150 hover:scale-110 active:scale-95 ${inWishlist
                ? "border-admin-primary/30 bg-admin-primary text-white shadow-sm"
                : "border-admin-border bg-white/95 text-admin-text backdrop-blur hover:bg-admin-muted"
                }`}
        >
            <span aria-hidden className="text-[13px] leading-none">
                {inWishlist ? "♥" : "♡"}
            </span>
        </button>
    );
}

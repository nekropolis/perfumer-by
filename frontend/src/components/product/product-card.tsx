import ProductCardBody from "@/components/product/product-card-body";
import ProductCardLoyaltyPrice from "@/components/product/product-card-loyalty-price";
import ProductCardWishlistButton from "@/components/product/product-card-wishlist-button";
import type { ProductListItem } from "@/types/catalog";

type Props = {
    product: ProductListItem;
    eager?: boolean;
    variant?: "catalog" | "featured";
};

export default function ProductCard({ product, eager = false, variant = "catalog" }: Props) {
    return (
        <ProductCardBody
            product={product}
            eager={eager}
            variant={variant}
            wishlistSlot={<ProductCardWishlistButton productId={product.id} />}
            loyaltySlot={variant === "catalog" ? <ProductCardLoyaltyPrice product={product} /> : null}
        />
    );
}

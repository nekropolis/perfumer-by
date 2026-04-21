import type { Metadata } from "next";
import WishlistPageView from "@/components/wishlist/wishlist-page-view";
import { buildSeoMetadata } from "@/lib/seo";

export const metadata: Metadata = buildSeoMetadata({
    title: "Избранное",
    description: "Ваш список избранных товаров.",
    canonicalPath: "/wishlist",
});

export default function WishlistPage() {
    return <WishlistPageView />;
}

import Image from "next/image";
import Link from "next/link";
import { normalizeProductImageUrl, productImageLoader } from "@/lib/product-image-url";
import type { RecentlyViewedProduct } from "@/lib/recently-viewed-products";

type Props = {
    product: RecentlyViewedProduct;
};

export default function RecentlyViewedProductCard({ product }: Props) {
    const imagePath = product.image ? normalizeProductImageUrl(product.image) : null;

    return (
        <Link
            href={`/${product.slug}`}
            className="flex h-full min-w-0 w-full items-start gap-2 rounded-2xl border border-admin-border bg-admin-surface px-2 py-1.5 transition duration-200 ease-out hover:z-10 hover:scale-[1.03] hover:border-admin-border-strong hover:bg-admin-bg hover:shadow-md active:scale-[0.99]"
        >
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-2xl bg-white">
                {imagePath ? (
                    <Image
                        src={imagePath}
                        loader={productImageLoader}
                        alt={product.name}
                        width={36}
                        height={36}
                        loading="lazy"
                        sizes="36px"
                        className="h-full w-full object-contain"
                    />
                ) : (
                    <div className="flex h-full items-center justify-center text-[9px] text-admin-text-muted">
                        Нет фото
                    </div>
                )}
            </div>

            <div className="min-w-0 flex-1">
                {product.brand_name ? (
                    <div className="break-words text-[11px] leading-4 text-admin-text-secondary">
                        {product.brand_name}
                    </div>
                ) : null}
                <div className="break-words text-xs font-semibold leading-4 text-admin-text">{product.name}</div>
            </div>
        </Link>
    );
}

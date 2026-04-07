export type ProductListItem = {
    id: number;
    name: string;
    slug: string;
    h1: string | null;
    short_description: string | null;
    brand: string | null;
    is_new: boolean;
    is_hit: boolean;
    min_price: string;
    old_price: string | null;
    image: string | null;
};

export type ProductsResponse = {
    data: ProductListItem[];
    meta: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
};

export type ProductDetailResponse = {
    data: ProductDetail;
};

export type ProductVariant = {
    id: number;
    sku: string | null;
    barcode: string | null;
    title: string;
    volume: number | null;
    volume_unit: string | null;
    concentration: string | null;
    edition: string | null;
    price: string;
    old_price: string | null;
    purchase_price: string | null;
    stock: number;
    is_preorder: boolean;
    is_active: boolean;
    sort_order: number;
    discount_percent: number | null;
};

export type ProductDetail = {
    id: number;
    name: string;
    slug: string;
    h1: string | null;
    short_description: string | null;
    description: string | null;
    seo_title: string | null;
    seo_description: string | null;
    brand: {
        id: number;
        name: string;
        slug: string;
    } | null;
    categories: {
        id: number;
        name: string;
        slug: string;
    }[];
    images: {
        id: number;
        path: string;
        alt: string | null;
        is_main: boolean;
        sort_order: number;
    }[];
    variants: ProductVariant[];
};

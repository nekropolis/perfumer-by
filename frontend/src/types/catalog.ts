export type ProductVariantData = {
    id: number;
    title: string;
    volume: number | null;
    volume_unit: string | null;
    type: string | null;
    concentration: string | null;
    edition: string | null;
    display_name: string;
    price: string | null;
    old_price: string | null;
    discount_percent: number | null;
    stock: number;
    is_preorder: boolean;
    is_active: boolean;
    is_available: boolean;
};

export type ProductAttributeData = {
    id: number;
    name: string;
    value: string;
    sort_order: number;
};

export type ProductImageData = {
    id: number;
    path: string;
    is_main: boolean;
    sort_order: number;
};

export type ProductListItem = {
    id: number;
    name: string;
    slug: string;
    h1: string | null;
    short_description: string | null;
    variant_labels: string[];

    brand: {
        id: number;
        name: string;
    } | null;

    main_category: {
        id: number;
        name: string;
        slug: string;
    } | null;

    image: string | null;

    is_new: boolean;
    is_hit: boolean;

    price_range: {
        min: string | null;
        max: string | null;
    };

    old_price_range: {
        min: string | null;
        max: string | null;
    };

    has_discount: boolean;
    discount_percent: number | null;

    stock_total: number;
    is_preorder_available: boolean;
    variants_count: number;
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


export type ProductDetailData = {
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

    main_category: {
        id: number;
        name: string;
        slug: string;
    } | null;

    categories: {
        id: number;
        name: string;
        slug: string;
    }[];

    images: ProductImageData[];

    attributes: ProductAttributeData[];

    price_range: {
        min: string | null;
        max: string | null;
    };

    stock_total: number;

    variants: ProductVariantData[];
    default_variant_id: number | null;
};

export type ProductDetailResponse = {
    data: ProductDetailData;
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

const CART_TOKEN_KEY = "cart_token";

function generateCartToken(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }

    return `cart_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function getCartToken(): string {
    if (typeof window === "undefined") {
        return "";
    }

    let token = localStorage.getItem(CART_TOKEN_KEY);

    if (!token) {
        token = generateCartToken();
        localStorage.setItem(CART_TOKEN_KEY, token);
    }

    return token;
}

export type CartItemData = {
    id: number;
    qty: number;

    product_id: number | null;
    product_variant_id: number | null;

    product_name: string | null;
    product_slug: string | null;
    brand_name: string | null;

    variant: {
        id: number;
        title: string;
        display_name: string;
        volume: number | null;
        volume_unit: string | null;
        type: string | null;
        concentration: string | null;
        edition: string | null;
    } | null;

    price: string;
    old_price: string | null;
    total: string;
    stock: number;
    is_preorder: boolean;
    is_available: boolean;
};

export type CartData = {
    id: number;
    token: string;
    qty: number;
    subtotal: string;
    total: string;
    items: CartItemData[];
};

export type CartResponse = {
    data: CartData;
};

export type OrderItem = {
    id: number;
    product_name: string;
    product_slug: string | null;
    brand_name: string | null;
    variant_title: string;
    sku: string | null;
    qty: number;
    price: string;
    total: string;
};

export type OrderData = {
    id: number;
    customer_name: string | null;
    phone: string;
    comment: string | null;
    status: string;
    items_qty: number;
    subtotal: string;
    total: string;
    items: OrderItem[];
};

export type OrdersResponse = {
    data: OrderData[];
    meta: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
};

export type OrderResponse = {
    data: OrderData;
};

export type CatalogBrandItem = {
    id: number;
    name: string;
    slug: string;
};

export type CatalogBrandsResponse = {
    data: CatalogBrandItem[];
};

export type CatalogBrandDetailResponse = {
    data: {
        id: number;
        name: string;
        slug: string;
    };
};

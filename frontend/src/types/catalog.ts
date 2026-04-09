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

export type CartItem = {
    id: number;
    qty: number;
    product: {
        id: number;
        name: string;
        slug: string;
        brand: string | null;
    } | null;
    variant: {
        id: number;
        title: string;
        sku: string | null;
        price: string;
        old_price: string | null;
        stock: number;
    } | null;
    price: string;
    total: string;
};

export type CartData = {
    id: number;
    token: string;
    qty: number;
    subtotal: string;
    items: CartItem[];
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

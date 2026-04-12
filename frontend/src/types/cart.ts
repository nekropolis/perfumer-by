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

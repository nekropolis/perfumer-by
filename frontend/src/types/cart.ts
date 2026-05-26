export type CartItemData = {
    id: number;
    qty: number;

    product_id: number | null;
    product_variant_id: number | null;

    product_name: string | null;
    product_display_name?: string | null;
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

export type CartDiscountCard = {
    number: string;
    discount_percent: string;
    discount_amount: string;
    session_only?: boolean;
};

export type CartGiftCertificateItem = {
    id: number;
    template_id: number;
    title: string;
    amount: string;
    qty: number;
    total: string;
};

export type CartData = {
    id: number;
    token: string;
    qty: number;
    subtotal: string;
    total: string;
    products_subtotal?: string;
    gift_certificates_subtotal?: string;
    gift_certificate: {
        code: string;
        number: string;
        amount: string;
    } | null;
    discount_card: CartDiscountCard | null;
    items: CartItemData[];
    gift_certificate_items: CartGiftCertificateItem[];
};

export type CartResponse = {
    data: CartData;
};

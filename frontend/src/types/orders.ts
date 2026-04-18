export type OrderItemSupplierOffer = {
    id: number;
    supplier_id: number;
    supplier_name: string | null;
    supplier_code: string | null;
    external_id: string | null;
    external_product_name: string | null;
    external_variant_name: string | null;
    external_product_url: string | null;
    sku: string | null;
    price: string | null;
    purchase_price: string | null;
    stock: number;
    is_preorder: boolean;
    is_active: boolean;
    last_synced_at: string | null;
};

export type OrderItem = {
    id: number;
    product_id: number | null;
    variant_id: number | null;
    product_name: string;
    product_slug: string | null;
    brand_name: string | null;
    variant_title: string;
    sku: string | null;
    qty: number;
    price: string;
    total: string;
    supplier_offers?: OrderItemSupplierOffer[];
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

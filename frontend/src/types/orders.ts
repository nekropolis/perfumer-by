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

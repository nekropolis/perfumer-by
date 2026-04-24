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

export type OrderItemReceiptBatch = {
    receipt_item_id: number;
    receipt_id: number;
    receipt_document_no: string | null;
    supplier_name: string | null;
    supplier_code: string | null;
    supplier_product_name: string | null;
    supplier_price: string | null;
    warehouse_name: string | null;
    qty: number;
    received_at: string | null;
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
    receipt_batches?: OrderItemReceiptBatch[];
};

export type OrderData = {
    id: number;
    customer_name: string | null;
    phone: string;
    comment: string | null;
    status: string;
    created_at?: string | null;
    items_qty: number;
    subtotal: string;
    delivery_method?: string | null;
    delivery_method_label?: string | null;
    delivery_city?: string | null;
    delivery_address?: string | null;
    delivery_fee?: string;
    payment_method?: string | null;
    payment_method_label?: string | null;
    total: string;
    gift_certificate_code?: string | null;
    gift_certificate_number?: string | null;
    gift_certificate_amount?: string;
    gift_certificates?: {
        code: string;
        amount_applied: string;
        nominal_amount?: string | null;
        balance_amount?: string | null;
    }[];
    /** Снимок из заказа: какая карта и с каким % была применена. */
    discount_card_number?: string | null;
    discount_percent_snapshot?: string;
    discount_amount?: string;
    items: OrderItem[];
    /** Заказ выполнен, но нет списания по складу — можно досоздать через API. */
    can_sync_inventory_writeoff?: boolean;
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

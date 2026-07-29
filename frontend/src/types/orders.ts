import type { ProductAvailabilitySource } from "@/types/catalog";

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

/** Покупка номинального сертификата по шаблону (строка в заказе, не путать со списанием оплаты). */
export type OrderGiftCertificatePurchase = {
    id: number;
    template_id: number;
    template_title: string;
    amount: string;
    qty: number;
    total: string;
};

/** Запись сертификата, привязанная к заказу (продажа); после «Выполнен» может быть status new без кода. */
export type OrderSoldGiftCertificate = {
    id: number;
    template_id: number | null;
    template_title: string | null;
    status: string;
    code: string | null;
    initial_amount: string;
    balance_amount: string;
};

export type OrderItemFulfillmentOption = {
    channel: "main" | "offer" | string;
    label: string;
    code: string | null;
    title: string | null;
    purchase_price: string | null;
    qty: number;
    lot_id?: number | null;
    comment?: string | null;
};

export type OrderItemStockLotAllocation = {
    lot_id: number;
    qty: number;
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
    waiting_discount: boolean;
    availability_source?: ProductAvailabilitySource | string | null;
    can_fulfill_main?: boolean;
    can_fulfill_offer?: boolean;
    fulfillment_options?: OrderItemFulfillmentOption[];
    product_country?: string | null;
    image?: string | null;
    supplier_offers?: OrderItemSupplierOffer[];
    receipt_batches?: OrderItemReceiptBatch[];
    stock_lot_allocations?: OrderItemStockLotAllocation[];
};

export type OrderData = {
    id: number;
    customer_name: string | null;
    phone: string;
    comment: string | null;
    status: string;
    status_label?: string | null;
    status_color?: string | null;
    created_at?: string | null;
    items_qty: number;
    subtotal: string;
    delivery_method?: string | null;
    delivery_method_label?: string | null;
    delivery_city?: string | null;
    /** ID города в справочнике ветерОК (belarus_courier). */
    delivery_city_id?: number | null;
    delivery_address?: string | null;
    delivery_street_prefix?: string | null;
    delivery_house?: string | null;
    delivery_korpus?: string | null;
    delivery_apartment?: string | null;
    delivery_comment?: string | null;
    /** ID отправки (курьер Минск / РБ). */
    shipment_id?: string | null;
    /** Статус заявки из ветерОК (getStatus.lastStatus). */
    shipment_status?: string | null;
    /** Когда статус ветерОК обновлялся. */
    shipment_status_at?: string | null;
    /** Дата отправки (YYYY-MM-DD). */
    shipment_date?: string | null;
    /** Дата доставки (YYYY-MM-DD). */
    delivery_date?: string | null;
    /** Время доставки с (HH:mm). */
    delivery_time_from?: string | null;
    /** Время доставки по (HH:mm). */
    delivery_time_to?: string | null;
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
    /** Купленные в этом заказе подарочные сертификаты (по шаблону, до выпуска кода). */
    gift_certificate_purchases?: OrderGiftCertificatePurchase[];
    /** Выпущенные по заказу записи gift_certificates (ожидают код при status new). */
    sold_gift_certificates?: OrderSoldGiftCertificate[];
    /** Снимок из заказа: какая карта и с каким % была применена. */
    discount_card_id?: number | null;
    discount_card_number?: string | null;
    discount_percent_snapshot?: string;
    discount_amount?: string;
    /** Комментарий менеджера (только admin API). */
    manager_comment?: string | null;
    /** Теги заказа (admin). */
    tags?: { id: number; name: string; color: string }[];
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

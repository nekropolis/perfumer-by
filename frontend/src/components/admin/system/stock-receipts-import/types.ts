import type { ManualLinkState } from "@/components/admin/import-export/seller-one/types";
import type { SellerOneSupplierProductItem } from "@/types/Vanille";

export type StockReceiptImportParsed = {
    brand?: string | null;
    brand_id?: number | null;
    product_name?: string | null;
    volume?: number | null;
    volume_is_multipack?: boolean;
    volume_multipack_count?: number | null;
    volume_multipack_unit_ml?: number | null;
    concentration?: string | null;
    is_tester?: boolean | null;
    is_vial?: boolean | null;
    skip_auto_match?: boolean | null;
};

export type StockReceiptImportCatalogVariant = {
    id: number;
    product_id?: number;
    product_name?: string | null;
    display_name?: string | null;
    brand_name?: string | null;
    display?: string;
};

export type StockReceiptImportUnresolvedRow = {
    map_key: string;
    code?: string;
    title?: string;
    qty?: number;
    supplier_price?: number | null;
    suggested_variant?: StockReceiptImportCatalogVariant | null;
    suggested_product?: {
        id: number;
        name: string;
        display_name?: string | null;
        slug?: string | null;
        brand_name?: string | null;
        variants_count?: number;
    } | null;
    /** Подтверждённая связка (сохраняется в session state вместе с unresolved). */
    linked_variant?: StockReceiptImportCatalogVariant | null;
    /** Строка сопоставлена автоматически на бэкенде (100% / сохранённый mapping). */
    auto_resolved?: boolean;
    parsed?: StockReceiptImportParsed | null;
    match_confidence?: number;
    match_confidence_breakdown?: SellerOneSupplierProductItem["match_confidence_breakdown"];
};

export type StockReceiptManualLinkState = ManualLinkState & {
    mapKey: string;
};

import type { ProductAdminItem } from "@/lib/admin-products-api";
import type { AdminProductVariantItem, VariantDefinitionItem } from "@/lib/admin-product-variants-api";

export type StockReceiptImportParsed = {
    brand?: string | null;
    product_name?: string | null;
    volume?: number | null;
    concentration?: string | null;
    is_tester?: boolean | null;
    skip_auto_match?: boolean | null;
};

export type StockReceiptImportUnresolvedRow = {
    map_key: string;
    code?: string;
    title?: string;
    qty?: number;
    suggested_variant?: {
        id?: number;
        product_id?: number;
        product_name?: string;
        display_name?: string | null;
        brand_name?: string | null;
        display?: string;
    } | null;
    parsed?: StockReceiptImportParsed | null;
};

export type StockReceiptManualLinkState = {
    mapKey: string;
    rowTitle: string;
    /** Предпочесть этот вариант после выбора товара (например, из suggested_variant бэкенда). */
    pendingPreferVariantId: number | null;
    productSearch: string;
    sourceHint: {
        brand: string;
        productName: string;
        volume: number | null;
        concentration: string | null;
        isTester: boolean;
    };
    products: ProductAdminItem[];
    productsLoading: boolean;
    selectedProductId: number | null;
    variants: AdminProductVariantItem[];
    variantsLoading: boolean;
    selectedVariantId: number | null;
    definitionSearch: string;
    definitions: VariantDefinitionItem[];
    definitionsLoading: boolean;
    attachingDefinition: boolean;
};

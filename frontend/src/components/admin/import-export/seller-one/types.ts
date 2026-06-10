import type { ProductAdminItem } from "@/lib/admin-products-api";
import type { AdminProductVariantItem, VariantDefinitionItem } from "@/lib/admin-product-variants-api";

export type ManualLinkState = {
    rowId: number;
    rowName: string;
    /** brand_id с строки поставщика — фильтр для link-search */
    linkSearchBrandId: number | null;
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
    /** Варианты для карточек в результатах поиска товара (product_id → variants). */
    previewVariantsByProductId: Record<number, AdminProductVariantItem[]>;
    previewVariantsLoading: boolean;
    selectedProductId: number | null;
    variants: AdminProductVariantItem[];
    variantsLoading: boolean;
    selectedVariantId: number | null;
    definitionSearch: string;
    definitions: VariantDefinitionItem[];
    definitionsLoading: boolean;
    attachingDefinition: boolean;
};

import type { ProductAdminItem } from "@/lib/admin-products-api";
import type { AdminProductVariantItem, VariantDefinitionItem } from "@/lib/admin-product-variants-api";

export type ManualLinkState = {
    rowId: number;
    rowName: string;
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

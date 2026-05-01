import type { Dispatch, SetStateAction } from "react";
import { useEffect } from "react";
import useDebouncedValue from "@/hooks/use-debounced-value";
import { fetchProductLinkSearch, type ProductAdminItem } from "@/lib/admin-products-api";
import { fetchVariantDefinitions } from "@/lib/admin-product-variants-api";
import {
    SELLER_ONE_DEFINITION_SEARCH_DEBOUNCE_MS,
    SELLER_ONE_PRODUCT_SEARCH_DEBOUNCE_MS,
} from "@/components/admin/import-export/seller-one/constants";
import type { StockReceiptManualLinkState } from "./types";
import { StockReceiptManualLinkModal } from "./manual-link-modal";

type StockReceiptManualLinkSearchHostProps = {
    manualLink: StockReceiptManualLinkState;
    setManualLink: Dispatch<SetStateAction<StockReceiptManualLinkState | null>>;
    setError: Dispatch<SetStateAction<string>>;
    loadManualVariants: (productId: number, preferVariantId?: number) => Promise<void>;
    attachDefinitionFromDictionary: (definitionId: number) => Promise<void>;
    onConfirmVariant: (mapKey: string, variantId: number) => void;
};

export function StockReceiptManualLinkSearchHost({
    manualLink,
    setManualLink,
    setError,
    loadManualVariants,
    attachDefinitionFromDictionary,
    onConfirmVariant,
}: StockReceiptManualLinkSearchHostProps) {
    const debouncedProductSearch = useDebouncedValue(
        manualLink.productSearch,
        SELLER_ONE_PRODUCT_SEARCH_DEBOUNCE_MS
    );
    const debouncedDefinitionSearch = useDebouncedValue(
        manualLink.definitionSearch,
        SELLER_ONE_DEFINITION_SEARCH_DEBOUNCE_MS
    );

    useEffect(() => {
        const mapKey = manualLink.mapKey;
        let cancelled = false;

        const run = async () => {
            setManualLink((prev) => (prev && prev.mapKey === mapKey ? { ...prev, productsLoading: true } : prev));
            try {
                const query = debouncedProductSearch.trim();
                let products: ProductAdminItem[] = [];
                if (query.length >= 2) {
                    const data = await fetchProductLinkSearch({ q: query, limit: 40 });
                    products = data.data || [];
                }

                if (cancelled) {
                    return;
                }

                setManualLink((prev) => {
                    if (!prev || prev.mapKey !== mapKey) {
                        return prev;
                    }
                    const keepProduct =
                        prev.selectedProductId != null && products.some((p) => p.id === prev.selectedProductId);
                    return {
                        ...prev,
                        products,
                        productsLoading: false,
                        selectedProductId: keepProduct ? prev.selectedProductId : null,
                        selectedVariantId: keepProduct ? prev.selectedVariantId : null,
                        variants: keepProduct ? prev.variants : [],
                        variantsLoading: keepProduct ? prev.variantsLoading : false,
                    };
                });
            } catch (e: unknown) {
                if (!cancelled) {
                    setManualLink((prev) => (prev && prev.mapKey === mapKey ? { ...prev, productsLoading: false } : prev));
                    setError(e instanceof Error ? e.message : "Ошибка поиска товаров");
                }
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [manualLink.mapKey, debouncedProductSearch, setManualLink, setError]);

    useEffect(() => {
        const mapKey = manualLink.mapKey;
        const productId = manualLink.selectedProductId;
        if (!productId) {
            return;
        }

        let cancelled = false;
        const q = debouncedDefinitionSearch.trim();

        const run = async () => {
            if (q === "") {
                setManualLink((prev) =>
                    prev && prev.mapKey === mapKey
                        ? { ...prev, definitions: [], definitionsLoading: false }
                        : prev
                );
                return;
            }

            setManualLink((prev) => (prev && prev.mapKey === mapKey ? { ...prev, definitionsLoading: true } : prev));
            try {
                const res = await fetchVariantDefinitions({ search: q, product_id: productId });
                if (cancelled) {
                    return;
                }
                setManualLink((prev) =>
                    prev && prev.mapKey === mapKey
                        ? {
                            ...prev,
                            definitions: res.data || [],
                            definitionsLoading: false,
                        }
                        : prev
                );
            } catch (e: unknown) {
                if (!cancelled) {
                    setManualLink((prev) => (prev && prev.mapKey === mapKey ? { ...prev, definitionsLoading: false } : prev));
                    setError(e instanceof Error ? e.message : "Ошибка поиска в справочнике");
                }
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [manualLink.mapKey, manualLink.selectedProductId, debouncedDefinitionSearch, setManualLink, setError]);

    return (
        <StockReceiptManualLinkModal
            manualLink={manualLink}
            setManualLink={setManualLink}
            onCloseAction={() => setManualLink(null)}
            onPickProductAction={loadManualVariants}
            onPickDefinitionAction={attachDefinitionFromDictionary}
            onConfirmAction={(variantId) => {
                onConfirmVariant(manualLink.mapKey, variantId);
                setManualLink(null);
            }}
        />
    );
}

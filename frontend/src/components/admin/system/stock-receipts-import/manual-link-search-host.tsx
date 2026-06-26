import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef } from "react";
import useDebouncedValue from "@/hooks/use-debounced-value";
import { ManualLinkModal } from "@/components/admin/import-export/seller-one/ui";
import {
    SELLER_ONE_DEFINITION_SEARCH_DEBOUNCE_MS,
    SELLER_ONE_PRODUCT_SEARCH_DEBOUNCE_MS,
} from "@/components/admin/import-export/seller-one/constants";
import { fetchProductLinkSearch, type ProductAdminItem } from "@/lib/admin-products-api";
import { fetchVariantDefinitions } from "@/lib/admin-product-variants-api";
import { formatVariantOptionLabel } from "@/components/admin/import-export/seller-one/utils";
import type { StockReceiptImportCatalogVariant, StockReceiptManualLinkState } from "./types";

type StockReceiptManualLinkSearchHostProps = {
    manualLink: StockReceiptManualLinkState;
    setManualLink: Dispatch<SetStateAction<StockReceiptManualLinkState | null>>;
    setError: Dispatch<SetStateAction<string>>;
    pickProduct: (product: ProductAdminItem) => Promise<void>;
    attachDefinitionFromDictionary: (definitionId: number) => Promise<void>;
    onConfirmAction: (mapKey: string, variantId: number, linkedVariant: StockReceiptImportCatalogVariant) => void;
    onPickVariantAction: (variantId: number) => void;
};

export function StockReceiptManualLinkSearchHost({
    manualLink,
    setManualLink,
    setError,
    pickProduct,
    attachDefinitionFromDictionary,
    onConfirmAction,
    onPickVariantAction,
}: StockReceiptManualLinkSearchHostProps) {
    const debouncedProductSearch = useDebouncedValue(
        manualLink.productSearch,
        SELLER_ONE_PRODUCT_SEARCH_DEBOUNCE_MS,
    );
    const debouncedDefinitionSearch = useDebouncedValue(
        manualLink.definitionSearch,
        SELLER_ONE_DEFINITION_SEARCH_DEBOUNCE_MS,
    );
    const isProductSearchDebouncing = manualLink.productSearch.trim() !== debouncedProductSearch.trim();
    const lastFetchedProductQueryRef = useRef<string | null>(null);
    const inFlightProductQueryRef = useRef<string | null>(null);

    useEffect(() => {
        lastFetchedProductQueryRef.current = null;
        inFlightProductQueryRef.current = null;
    }, [manualLink.mapKey]);

    useEffect(() => {
        const mapKey = manualLink.mapKey;
        const linkSearchBrandId = manualLink.linkSearchBrandId;

        if (manualLink.selectedProductId !== null) {
            return;
        }

        const query = debouncedProductSearch.trim();
        if (query.length < 2) {
            lastFetchedProductQueryRef.current = null;
            inFlightProductQueryRef.current = null;
            setManualLink((prev) =>
                prev && prev.mapKey === mapKey ? { ...prev, products: [], productsLoading: false } : prev,
            );
            return;
        }

        if (query === lastFetchedProductQueryRef.current || query === inFlightProductQueryRef.current) {
            return;
        }

        let cancelled = false;
        inFlightProductQueryRef.current = query;

        const run = async () => {
            setManualLink((prev) =>
                prev && prev.mapKey === mapKey && prev.selectedProductId === null
                    ? { ...prev, productsLoading: true }
                    : prev,
            );
            try {
                const data = await fetchProductLinkSearch({
                    q: query,
                    brand_id: linkSearchBrandId ?? undefined,
                    limit: 40,
                });
                const nextProducts = data.data || [];

                if (cancelled) {
                    return;
                }

                lastFetchedProductQueryRef.current = query;
                inFlightProductQueryRef.current = null;

                setManualLink((prev) => {
                    if (!prev || prev.mapKey !== mapKey || prev.selectedProductId !== null) {
                        return prev;
                    }

                    return {
                        ...prev,
                        products: nextProducts,
                        productsLoading: false,
                    };
                });
            } catch (e: unknown) {
                if (!cancelled) {
                    inFlightProductQueryRef.current = null;
                    setManualLink((prev) => (prev && prev.mapKey === mapKey ? { ...prev, productsLoading: false } : prev));
                    setError(e instanceof Error ? e.message : "Ошибка поиска товаров");
                }
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [manualLink.mapKey, manualLink.linkSearchBrandId, manualLink.selectedProductId, debouncedProductSearch, setManualLink, setError]);

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
                    prev && prev.mapKey === mapKey ? { ...prev, definitions: [], definitionsLoading: false } : prev,
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
                        : prev,
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
        <ManualLinkModal
            manualLink={manualLink}
            isProductSearchDebouncing={isProductSearchDebouncing}
            linkingRowId={null}
            setManualLink={setManualLink}
            onCloseAction={() => setManualLink(null)}
            onPickProductAction={pickProduct}
            onPickVariantAction={onPickVariantAction}
            onPickDefinitionAction={attachDefinitionFromDictionary}
            onConfirmAction={(_rowId, variantId) => {
                const selected = manualLink.variants.find((variant) => variant.id === variantId);
                const product = manualLink.products.find((item) => item.id === manualLink.selectedProductId)
                    ?? manualLink.products.find((item) => item.id === selected?.product_id);

                onConfirmAction(manualLink.mapKey, variantId, {
                    id: variantId,
                    product_id: selected?.product_id ?? product?.id,
                    product_name: product?.name ?? null,
                    display_name: product?.brand?.name
                        ? `${product.brand.name} ${product.name}`.trim()
                        : product?.name ?? null,
                    brand_name: product?.brand?.name ?? null,
                    display: selected ? formatVariantOptionLabel(selected) : "",
                });
                setManualLink(null);
            }}
        />
    );
}

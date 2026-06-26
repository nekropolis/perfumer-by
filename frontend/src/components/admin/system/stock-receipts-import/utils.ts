import type { SellerOneSupplierProductItem } from "@/types/Vanille";
import { canConfirmSuggestedLink } from "@/components/admin/import-export/seller-one/utils";
import type {
    StockReceiptImportCatalogVariant,
    StockReceiptImportUnresolvedRow,
} from "./types";

export function mapKeyToRowId(mapKey: string): number {
    let hash = 0;
    for (let i = 0; i < mapKey.length; i += 1) {
        hash = (hash * 31 + mapKey.charCodeAt(i)) | 0;
    }

    return Math.abs(hash) || 1;
}

export function isImportRowLinked(mapKey: string, mappingByKey: Record<string, string>): boolean {
    return Number(mappingByKey[mapKey] ?? 0) > 0;
}

export function buildInitialSearchFromImportRow(row: StockReceiptImportUnresolvedRow): string {
    const parsedBrand = row.parsed?.brand?.trim() || "";
    const parsedName = row.parsed?.product_name?.trim() || "";

    if (parsedBrand && parsedName) {
        return `${parsedBrand} ${parsedName}`.trim();
    }

    if (parsedName) {
        return parsedName;
    }

    const title = row.title || "";
    const compact = title
        .replace(/\b(test|tester)\b/gi, " ")
        .replace(/\b\d+(?:[.,]\d+)?\s*(ml|мл)\b/gi, " ")
        .replace(/\b(edp|edt|edc|parfum|extrait)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

    return compact || title;
}

export function resolveImportRowLinkedVariant(
    row: StockReceiptImportUnresolvedRow,
    mappingByKey: Record<string, string>,
): StockReceiptImportCatalogVariant | null {
    const variantId = Number(mappingByKey[row.map_key] ?? 0);
    if (variantId <= 0) {
        return null;
    }

    if (row.linked_variant?.id === variantId) {
        return row.linked_variant;
    }

    if (row.suggested_variant?.id === variantId) {
        return row.suggested_variant;
    }

    if (row.linked_variant) {
        return row.linked_variant;
    }

    return null;
}

export function importRowAsSellerOneView(
    row: StockReceiptImportUnresolvedRow,
    mappingByKey: Record<string, string>,
): SellerOneSupplierProductItem {
    const linkedVariant = resolveImportRowLinkedVariant(row, mappingByKey);
    const isLinked = linkedVariant != null;

    return {
        id: mapKeyToRowId(row.map_key),
        external_name: row.title || row.code || row.map_key,
        external_slug: null,
        external_url: "",
        is_linked: isLinked,
        is_active: true,
        link_parsing_active: true,
        last_seen_at: null,
        code: row.code || "",
        supplier_price: row.supplier_price ?? null,
        price_file_in_stock: null,
        catalog_supplier_channel_available: null,
        parsed: row.parsed
            ? {
                brand: row.parsed.brand,
                product_name: row.parsed.product_name,
                volume: row.parsed.volume,
                volume_is_multipack: row.parsed.volume_is_multipack,
                volume_multipack_count: row.parsed.volume_multipack_count,
                volume_multipack_unit_ml: row.parsed.volume_multipack_unit_ml,
                concentration: row.parsed.concentration,
                is_tester: row.parsed.is_tester ?? undefined,
                is_vial: row.parsed.is_vial ?? undefined,
            }
            : null,
        is_new: Boolean(row.suggested_product && !row.suggested_variant),
        match_confidence: row.match_confidence ?? 0,
        match_confidence_breakdown: row.match_confidence_breakdown ?? null,
        status: isLinked
            ? "confirmed"
            : row.suggested_variant
                ? "found_unconfirmed"
                : row.suggested_product
                    ? "new"
                    : "unlinked",
        brand: row.parsed?.brand
            ? { id: row.parsed.brand_id ?? 0, name: row.parsed.brand }
            : null,
        product: null,
        suggested_variant: row.suggested_variant
            ? {
                id: row.suggested_variant.id,
                product_id: row.suggested_variant.product_id ?? 0,
                product_name: row.suggested_variant.product_name ?? null,
                display_name: row.suggested_variant.display_name ?? null,
                brand_name: row.suggested_variant.brand_name ?? null,
                display: row.suggested_variant.display || "",
            }
            : null,
        suggested_product: row.suggested_product
            ? {
                id: row.suggested_product.id,
                name: row.suggested_product.name,
                display_name: row.suggested_product.display_name ?? undefined,
                slug: row.suggested_product.slug ?? null,
                brand_name: row.suggested_product.brand_name ?? null,
                variants_count: row.suggested_product.variants_count ?? 0,
            }
            : null,
        linked_variant: linkedVariant
            ? {
                id: linkedVariant.id,
                product_id: linkedVariant.product_id ?? 0,
                product_name: linkedVariant.product_name ?? null,
                display_name: linkedVariant.display_name ?? null,
                brand_name: linkedVariant.brand_name ?? null,
                display: linkedVariant.display || "",
            }
            : null,
    };
}

/** Предзаполнение галочек «Связка» после разбора XLS (как подтверждённые строки в Seller One). */
export function buildInitialMappingFromImportRows(
    rows: StockReceiptImportUnresolvedRow[],
): Record<string, string> {
    const mapping: Record<string, string> = {};

    for (const row of rows) {
        if (row.linked_variant?.id) {
            mapping[row.map_key] = String(row.linked_variant.id);
            continue;
        }

        const sellerOneRow = importRowAsSellerOneView(row, mapping);
        if (canConfirmSuggestedLink(sellerOneRow) && row.suggested_variant?.id) {
            mapping[row.map_key] = String(row.suggested_variant.id);
        }
    }

    return mapping;
}

export function countImportRowsNeedingManualLink(
    rows: StockReceiptImportUnresolvedRow[],
    mappingByKey: Record<string, string>,
): number {
    return rows.filter((row) => !Number(mappingByKey[row.map_key] ?? 0)).length;
}

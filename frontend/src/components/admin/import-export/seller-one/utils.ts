import type { ProductAdminItem } from "@/lib/admin-products-api";
import type { AdminProductVariantItem, VariantDefinitionItem } from "@/lib/admin-product-variants-api";
import type { SellerOneSupplierProductItem } from "@/types/Vanille";

export function formatVariantOptionLabel(variant: AdminProductVariantItem): string {
    const title = (variant.title || "").trim();
    if (title) {
        return title;
    }

    const parts: string[] = [];
    if (variant.volume) {
        parts.push(`${variant.volume} ${variant.volume_unit || "ml"}`);
    }
    if (variant.concentration) {
        parts.push(String(variant.concentration).toUpperCase());
    }
    if (variant.edition) {
        parts.push(String(variant.edition).toUpperCase());
    }
    if (variant.type) {
        parts.push(variant.type);
    }

    return parts.length > 0 ? parts.join(" / ") : `Вариант ${variant.id}`;
}

export function buildInitialSearchFromRow(row: SellerOneSupplierProductItem): string {
    const parsedBrand = row.parsed?.brand?.trim() || "";
    const parsedName = row.parsed?.product_name?.trim() || "";

    if (parsedBrand && parsedName) {
        return `${parsedBrand} ${parsedName}`.trim();
    }

    if (parsedName) {
        return parsedName;
    }

    const external = row.external_name || "";
    const compact = external
        .replace(/\b(test|tester)\b/gi, " ")
        .replace(/\b\d+(?:[.,]\d+)?\s*(ml|мл)\b/gi, " ")
        .replace(/\b(edp|edt|edc|parfum|extrait)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    return compact || external;
}

export function normalizeSearchText(value: string): string {
    return value
        .replace(/\([^)]*\)/g, " ")
        .replace(/\b(m|w|l|men|women|man|woman)\b/gi, " ")
        .replace(/\b(test|tester)\b/gi, " ")
        .replace(/\b\d+(?:[.,]\d+)?\s*(ml|мл)\b/gi, " ")
        .replace(/\b(edp|edt|edc|parfum|extrait)\b/gi, " ")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function buildSearchCandidates(query: string): string[] {
    const normalized = normalizeSearchText(query);
    const words = normalized.split(" ").filter(Boolean);
    const candidates = new Set<string>();

    if (query.trim()) {
        candidates.add(query.trim());
    }

    if (normalized) {
        candidates.add(normalized);
    }

    if (words.length >= 2) {
        candidates.add(words.slice(-2).join(" "));
    }
    if (words.length >= 3) {
        candidates.add(words.slice(-3).join(" "));
    }

    return Array.from(candidates).filter((item) => item.length >= 3);
}

export function rankProducts(products: ProductAdminItem[], query: string): ProductAdminItem[] {
    const target = normalizeSearchText(query).toLowerCase();
    const targetWords = target.split(" ").filter(Boolean);

    const scored = products.map((product) => {
        const name = normalizeSearchText(product.name).toLowerCase();
        const brand = normalizeSearchText(product.brand?.name || "").toLowerCase();
        const full = `${brand} ${name}`.trim();
        let score = 0;

        if (full === target) {
            score += 1000;
        }
        if (full.includes(target)) {
            score += 400;
        }
        if (name.includes(target)) {
            score += 250;
        }

        for (const word of targetWords) {
            if (word.length < 3) continue;
            if (name.includes(word)) score += 35;
            if (brand.includes(word)) score += 20;
        }

        return { product, score };
    });

    return scored
        .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
        .map((item) => item.product);
}

export function normalizeProductComparable(value: string): string {
    return normalizeSearchText(value).toLowerCase();
}

export function isExactProductNameMatch(sourceName: string, candidateName: string): boolean {
    const left = normalizeProductComparable(sourceName);
    const right = normalizeProductComparable(candidateName);
    return left !== "" && left === right;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pickOriginalPhrase(normalizedPhrase: string, ...originals: string[]): string {
    const pattern = normalizedPhrase
        .split(" ")
        .filter(Boolean)
        .map(escapeRegExp)
        .join("\\s+");
    if (!pattern) {
        return "";
    }

    const re = new RegExp(pattern, "i");
    for (const original of originals) {
        const match = original.match(re);
        if (match?.[0]) {
            return match[0];
        }
    }

    return "";
}

/**
 * Общая фраза для подсветки в оригинальном регистре (напр. «Montale Wild Pears»).
 */
export function findProductNameMatchHighlight(supplierLabel: string, catalogLabel: string): string {
    const supplierNorm = normalizeProductComparable(supplierLabel);
    const catalogNorm = normalizeProductComparable(catalogLabel);
    if (!supplierNorm || !catalogNorm) {
        return "";
    }

    if (supplierNorm.includes(catalogNorm)) {
        return pickOriginalPhrase(catalogNorm, catalogLabel, supplierLabel);
    }

    if (catalogNorm.includes(supplierNorm)) {
        return pickOriginalPhrase(supplierNorm, catalogLabel, supplierLabel);
    }

    const supplierWords = supplierNorm.split(" ").filter(Boolean);
    const catalogWords = catalogNorm.split(" ").filter(Boolean);
    let commonLength = 0;
    while (
        commonLength < supplierWords.length
        && commonLength < catalogWords.length
        && supplierWords[commonLength] === catalogWords[commonLength]
    ) {
        commonLength += 1;
    }

    if (commonLength === 0) {
        return "";
    }

    return pickOriginalPhrase(
        supplierWords.slice(0, commonLength).join(" "),
        catalogLabel,
        supplierLabel,
    );
}

export function buildSupplierParsedLabel(
    parsed: SellerOneSupplierProductItem["parsed"],
    externalName: string,
): string {
    const brand = parsed?.brand?.trim() || "";
    const name = parsed?.product_name?.trim() || "";
    const combined = [brand, name].filter(Boolean).join(" ").trim();

    return combined || externalName;
}

export function getRowCatalogProductLabel(row: SellerOneSupplierProductItem): string | null {
    if (row.linked_variant) {
        return row.linked_variant.display_name || row.linked_variant.product_name || null;
    }
    if (row.suggested_variant) {
        return row.suggested_variant.display_name || row.suggested_variant.product_name || null;
    }
    if (row.suggested_product) {
        return row.suggested_product.display_name || row.suggested_product.name || null;
    }

    return null;
}

export function getConfidenceBadgeClass(confidence: number): string {
    if (confidence >= 95) {
        return "bg-green-100 text-green-700";
    }
    if (confidence >= 80) {
        return "bg-amber-100 text-amber-700";
    }
    return "bg-red-100 text-red-700";
}

export type SupplierVariantHint = {
    volume: number | null;
    concentration: string | null;
    isTester: boolean;
};

export type VariantMatchFlags = {
    volume: boolean;
    concentration: boolean;
    /** Совпадение флага тестера (только если {@see testerRelevant}). */
    tester: boolean;
    /** Показывать и учитывать тестер: у поставщика test/tester или вариант — тестер. */
    testerRelevant: boolean;
    score: number;
};

export function normalizeConcentrationCode(value: string | null | undefined): string {
    const normalized = (value || "").trim().toLowerCase();
    if (!normalized) {
        return "";
    }
    if (normalized.includes("extrait")) {
        return "extrait de parfum";
    }
    if (normalized === "parfum") {
        return "extrait de parfum";
    }

    return normalized;
}

export function getVariantMatchFlags(
    variant: {
        volume?: number | null;
        concentration?: string | null;
        definition?: {
            volume_ml?: number;
            concentration_code?: string;
            is_tester?: boolean;
        } | null;
    },
    hint: SupplierVariantHint,
): VariantMatchFlags {
    const variantVolume = variant.volume ?? variant.definition?.volume_ml ?? null;
    const variantConcentration = variant.concentration ?? variant.definition?.concentration_code ?? null;
    const variantIsTester = Boolean(variant.definition?.is_tester);

    const volume =
        hint.volume != null
        && variantVolume != null
        && Math.abs(Number(variantVolume) - hint.volume) <= 0.01;

    const hintConcentration = normalizeConcentrationCode(hint.concentration);
    const concentration =
        hintConcentration !== ""
        && normalizeConcentrationCode(variantConcentration) === hintConcentration;

    const testerRelevant = hint.isTester || variantIsTester;
    const tester = variantIsTester === hint.isTester;

    const score =
        (volume ? 70 : 0)
        + (concentration ? 30 : 0)
        + (testerRelevant && tester ? 20 : 0);

    return { volume, concentration, tester, testerRelevant, score };
}

export function getDefinitionMatchFlags(
    definition: VariantDefinitionItem,
    hint: SupplierVariantHint,
): VariantMatchFlags {
    return getVariantMatchFlags(
        {
            volume: definition.volume_ml,
            concentration: definition.concentration_code,
            definition: {
                volume_ml: definition.volume_ml,
                concentration_code: definition.concentration_code,
                is_tester: definition.is_tester,
            },
        },
        hint,
    );
}

export function isFullVariantMatch(flags: VariantMatchFlags): boolean {
    return flags.volume
        && flags.concentration
        && (!flags.testerRelevant || flags.tester);
}

export function getVariantMatchRowClass(flags: VariantMatchFlags, selected: boolean): string {
    if (selected) {
        return "bg-admin-primary text-white";
    }
    if (isFullVariantMatch(flags)) {
        return "bg-green-50 ring-1 ring-green-200 hover:bg-green-100";
    }
    if (flags.score > 0) {
        return "bg-amber-50 ring-1 ring-amber-200 hover:bg-amber-100";
    }

    return "hover:bg-admin-muted";
}

export function buildDefinitionSearchFromHint(hint: SupplierVariantHint): string {
    const parts: string[] = [];
    if (hint.volume != null) {
        parts.push(String(hint.volume));
    }
    if (hint.concentration) {
        parts.push(hint.concentration);
    }
    if (hint.isTester) {
        parts.push("tester");
    }

    return parts.join(" ").trim();
}

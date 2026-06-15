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
        .replace(/\(([^)]*)\)/g, " $1 ")
        // L'Envol, L'Homme — не разбивать на отдельную «L» до удаления маркеров пола.
        .replace(/(\p{L})[''\u2019](?=\p{L})/gu, "$1")
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

export function formatCatalogProductLabel(product: ProductAdminItem): string {
    return product.brand?.name
        ? `${product.brand.name} ${product.name}`.trim()
        : product.name;
}

export function buildSupplierLabelFromHint(hint: {
    brand: string;
    productName: string;
}): string {
    return [hint.brand.trim(), hint.productName.trim()].filter(Boolean).join(" ").trim();
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

/** Между словами в оригинале могут быть &, :, /, дефисы и прочие разделители. */
const FLEXIBLE_WORD_GAP = "(?:[^\\p{L}\\p{N}]|\\s)+";

const FLEXIBLE_APOSTROPHE = "[''\u2019]?";

/** Сопоставляет L'Envol с нормализованным lenvol. */
function normalizedWordToFlexiblePattern(normalizedWord: string): string {
    if (!normalizedWord) {
        return "";
    }

    return normalizedWord
        .split("")
        .map((char) => escapeRegExp(char))
        .join(FLEXIBLE_APOSTROPHE);
}

export type NameMatchHighlightRange = {
    start: number;
    end: number;
};

/** Включает « )» после совпадения вида «( Gold )». */
function extendParenWrappedSuffix(text: string, start: number, end: number): number {
    if (!text.slice(start, end).includes("(")) {
        return end;
    }

    let next = end;
    while (next < text.length && /\s/.test(text[next])) {
        next += 1;
    }
    if (text[next] === ")") {
        return next + 1;
    }

    return end;
}

function mergeHighlightRanges(ranges: NameMatchHighlightRange[]): NameMatchHighlightRange[] {
    ranges.sort((a, b) => a.start - b.start || a.end - b.end);
    const merged: NameMatchHighlightRange[] = [];
    for (const range of ranges) {
        const last = merged[merged.length - 1];
        if (!last || range.start >= last.end) {
            merged.push({ ...range });
            continue;
        }
        last.end = Math.max(last.end, range.end);
    }
    return merged;
}

/**
 * Подсветка в конкретном отображаемом тексте: exact — одна фраза с гибкими разделителями,
 * partial — отдельные общие слова.
 */
export function findNameMatchHighlightRanges(
    text: string,
    normalizedWords: string[],
    exact: boolean,
): NameMatchHighlightRange[] {
    if (!text || normalizedWords.length === 0) {
        return [];
    }

    const ranges: NameMatchHighlightRange[] = [];

    if (exact) {
        const pattern = normalizedWords.map(normalizedWordToFlexiblePattern).join(FLEXIBLE_WORD_GAP);
        const re = new RegExp(pattern, "giu");
        let match: RegExpExecArray | null;
        while ((match = re.exec(text)) !== null) {
            const start = match.index;
            const end = extendParenWrappedSuffix(text, start, start + match[0].length);
            ranges.push({ start, end });
            if (match[0].length === 0) {
                re.lastIndex += 1;
            }
        }
        return mergeHighlightRanges(ranges);
    }

    for (const word of normalizedWords) {
        if (word.length < 2) {
            continue;
        }
        const re = new RegExp(
            `\\b${normalizedWordToFlexiblePattern(word)}\\b`,
            "giu",
        );
        let match: RegExpExecArray | null;
        while ((match = re.exec(text)) !== null) {
            ranges.push({ start: match.index, end: match.index + match[0].length });
            if (match[0].length === 0) {
                re.lastIndex += 1;
            }
        }
    }

    return mergeHighlightRanges(ranges);
}

export type ProductNameMatchInfo = {
    words: string[];
    /** Слова каталога по подпоследовательности (без лишних дублей вроде второго «Armani»). */
    catalogWords: string[];
    exact: boolean;
};

function subsequenceMatchedCatalogWords(supplierNorm: string, catalogNorm: string): string[] {
    const supplierTokens = supplierNorm.split(" ").filter((word) => word.length >= 2);
    const catalogTokens = catalogNorm.split(" ").filter((word) => word.length >= 2);
    const matched: string[] = [];
    let supplierIndex = 0;

    for (const catalogToken of catalogTokens) {
        if (
            supplierIndex < supplierTokens.length
            && catalogToken === supplierTokens[supplierIndex]
        ) {
            matched.push(catalogToken);
            supplierIndex += 1;
        }
    }

    return matched;
}

/**
 * Подсветка каталога: по одному вхождению каждого слова, слева направо (подпоследовательность).
 */
export function findSubsequenceHighlightRanges(
    text: string,
    normalizedWords: string[],
): NameMatchHighlightRange[] {
    if (!text || normalizedWords.length === 0) {
        return [];
    }

    const ranges: NameMatchHighlightRange[] = [];
    let searchFrom = 0;

    for (const word of normalizedWords) {
        if (word.length < 2) {
            continue;
        }

        const re = new RegExp(
            `\\b${normalizedWordToFlexiblePattern(word)}\\b`,
            "giu",
        );
        re.lastIndex = searchFrom;
        const match = re.exec(text);
        if (!match) {
            continue;
        }

        const start = match.index;
        const end = extendParenWrappedSuffix(text, start, start + match[0].length);
        ranges.push({ start, end });
        searchFrom = end;
    }

    return ranges;
}

/**
 * Нормализованные слова для подсветки в обеих колонках.
 * exact — зелёная фраза; иначе жёлтые общие слова.
 */
export function findProductNameMatchInfo(supplierLabel: string, catalogLabel: string): ProductNameMatchInfo {
    const supplierNorm = normalizeProductComparable(supplierLabel);
    const catalogNorm = normalizeProductComparable(catalogLabel);
    if (!supplierNorm || !catalogNorm) {
        return { words: [], catalogWords: [], exact: false };
    }

    if (isExactProductNameMatch(supplierLabel, catalogLabel)) {
        const words = supplierNorm.split(" ").filter(Boolean);
        return { words, catalogWords: words, exact: true };
    }

    const catalogWordSet = new Set(
        catalogNorm.split(" ").filter((word) => word.length >= 2),
    );
    const words = [...new Set(
        supplierNorm.split(" ").filter((word) => word.length >= 2 && catalogWordSet.has(word)),
    )];
    const catalogWords = subsequenceMatchedCatalogWords(supplierNorm, catalogNorm);

    return { words, catalogWords, exact: false };
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
    if (confidence >= 50) {
        return "bg-orange-100 text-orange-800";
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
    if (normalized === "parfum" || normalized === "parfume" || normalized === "parfums") {
        return "extrait de parfum";
    }

    return normalized;
}

export function getVariantVolumeMl(variant: {
    volume?: number | null;
    definition?: {
        volume_ml?: number;
    } | null;
}): number | null {
    const raw = variant.volume ?? variant.definition?.volume_ml ?? null;
    if (raw == null) {
        return null;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

/** Если в прайсе известен объём — показываем только варианты с тем же volume_ml. */
export function variantMatchesVolumeHint(
    variant: {
        volume?: number | null;
        definition?: {
            volume_ml?: number;
        } | null;
    },
    hint: SupplierVariantHint,
): boolean {
    if (hint.volume == null) {
        return true;
    }

    const variantVolume = getVariantVolumeMl(variant);
    if (variantVolume == null) {
        return false;
    }

    return Math.abs(variantVolume - hint.volume) <= 0.01;
}

export function definitionMatchesVolumeHint(
    definition: Pick<VariantDefinitionItem, "volume_ml">,
    hint: SupplierVariantHint,
): boolean {
    if (hint.volume == null) {
        return true;
    }

    if (definition.volume_ml == null) {
        return false;
    }

    return Math.abs(Number(definition.volume_ml) - hint.volume) <= 0.01;
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
    const variantVolume = getVariantVolumeMl(variant);
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
    if (hint.volume != null) {
        return String(hint.volume);
    }

    const parts: string[] = [];
    if (hint.concentration) {
        parts.push(hint.concentration);
    }
    if (hint.isTester) {
        parts.push("tester");
    }

    return parts.join(" ").trim();
}

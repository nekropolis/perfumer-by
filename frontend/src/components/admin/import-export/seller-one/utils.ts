import type { ProductAdminItem } from "@/lib/admin-products-api";
import type { AdminProductVariantItem, VariantDefinitionItem } from "@/lib/admin-product-variants-api";
import type { SellerOneSupplierProductItem } from "@/types/Vanille";

export function formatParsedSupplierVariantHint(parsed: {
    volume?: number | null;
    volume_is_multipack?: boolean | null;
    volume_multipack_count?: number | null;
    volume_multipack_unit_ml?: number | null;
    concentration?: string | null;
    is_tester?: boolean | null;
    is_vial?: boolean | null;
} | null | undefined): string {
    if (!parsed) {
        return "—";
    }

    const parts: string[] = [];
    if (
        parsed.volume_is_multipack
        && parsed.volume_multipack_count != null
        && parsed.volume_multipack_unit_ml != null
    ) {
        parts.push(`${parsed.volume_multipack_count}×${parsed.volume_multipack_unit_ml} мл`);
    } else if (parsed.volume != null) {
        parts.push(`${parsed.volume} мл`);
    }
    if (parsed.concentration) {
        parts.push(String(parsed.concentration).toUpperCase());
    }
    if (parsed.is_tester) {
        parts.push("Тестер");
    }
    if (parsed.is_vial) {
        parts.push("Пробник");
    }

    return parts.length > 0 ? parts.join(" / ") : "—";
}

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
        // Только одиночные (M)/(L)/(U); не выкидывать «women» из бренда Women Secret.
        .replace(/\b(m|w|l|u)\b/gi, " ")
        .replace(/\b(unisex)\b/gi, " ")
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

export const GENDER_CANON_FEMALE = "__linkgf__";
export const GENDER_CANON_MALE = "__linkgm__";
export const GENDER_CANON_UNISEX = "__linkgu__";

export function isGenderCanonToken(token: string): boolean {
    return token === GENDER_CANON_FEMALE
        || token === GENDER_CANON_MALE
        || token === GENDER_CANON_UNISEX;
}

/** Базовая нормализация имени без схлопывания «de parfum» / «parfum» (для подсветки). */
function normalizeMatcherProductBaseText(value: string): string {
    return value
        .replace(/\(([^)]*)\)/g, " $1 ")
        .replace(/(\p{L})[''\u2019](?=\p{L})/gu, "$1")
        .replace(/\b(test|tester|тестер)\b/gi, " ")
        .replace(/\b\d+(?:[.,]\d+)?\s*(ml|мл)\b/gi, " ")
        .replace(/\b(edp|edt|edc|extrait)\b/gi, " ")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

/** Нормализация имени для матча — без выкидывания for man / for him до канонизации пола. */
function normalizeMatcherProductText(value: string): string {
    let normalized = normalizeMatcherProductBaseText(value);
    normalized = normalized.replace(/\bde\s+parfum\b/gi, " de ");
    normalized = normalized.replace(/\b(parfum|parfume|parfums)\b/gi, " de ");

    return normalized.replace(/\s+/g, " ").trim();
}

function applyGenderCanonicalTokens(normalized: string): string {
    let value = normalized;
    const replacements: Array<[RegExp, string]> = [
        [/\bfor\s+women\b/gi, ` ${GENDER_CANON_FEMALE} `],
        [/\bfor\s+woman\b/gi, ` ${GENDER_CANON_FEMALE} `],
        [/\bfor\s+her\b/gi, ` ${GENDER_CANON_FEMALE} `],
        [/\bfor\s+men\b/gi, ` ${GENDER_CANON_MALE} `],
        [/\bfor\s+man\b/gi, ` ${GENDER_CANON_MALE} `],
        [/\bfor\s+him\b/gi, ` ${GENDER_CANON_MALE} `],
        [/\bunisex\b/gi, ` ${GENDER_CANON_UNISEX} `],
    ];

    for (const [pattern, replacement] of replacements) {
        value = value.replace(pattern, replacement);
    }

    return value.replace(/\s+/g, " ").trim();
}

/** Women'Secret ≡ Women Secret ≡ womensecret для снятия бренда и подсветки. */
export function brandPrefixNormalizedVariants(brandName: string): string[] {
    const raw = brandName.trim();
    if (raw === "") {
        return [];
    }

    const inputs = new Set<string>([
        raw,
        raw.replace(/(\p{L})[''\u2019](?=\p{L})/gu, "$1 "),
        raw.replace(/\s*&\s*/g, " and "),
    ]);
    const variants = new Set<string>();

    for (const input of inputs) {
        const normalized = normalizeMatcherProductBaseText(input);
        if (normalized === "") {
            continue;
        }
        variants.add(normalized);
        variants.add(normalized.replace(/\s+/g, ""));
    }

    return [...variants];
}

export function brandsHighlightEquivalent(left: string, right: string): boolean {
    if (left.trim() === "" || right.trim() === "") {
        return false;
    }

    const leftVariants = new Set(brandPrefixNormalizedVariants(left));
    for (const variant of brandPrefixNormalizedVariants(right)) {
        if (leftVariants.has(variant)) {
            return true;
        }
    }

    return false;
}

function stripBrandPrefixNormalized(normalized: string, brandName?: string | null): string {
    const brand = (brandName || "").trim();
    if (!brand) {
        return normalized;
    }

    for (const brandNorm of brandPrefixNormalizedVariants(brand)) {
        if (brandNorm && normalized === brandNorm) {
            return "";
        }
        if (brandNorm && normalized.startsWith(`${brandNorm} `)) {
            return normalized.slice(brandNorm.length).trim();
        }
    }

    return normalized;
}

function genderPhraseHighlightTokens(phrase: string): string[] {
    return normalizeMatcherProductBaseText(phrase)
        .split(" ")
        .filter((token) => token.length >= 2);
}

/** for Him / for Her — маркеры пола в названии; Pour Homme — обычные слова линии, не сюда. */
function extractGenderHighlightWords(productName: string): string[] {
    const patterns = [
        /\bfor\s+women\b/i,
        /\bfor\s+woman\b/i,
        /\bfor\s+her\b/i,
        /\bfor\s+men\b/i,
        /\bfor\s+man\b/i,
        /\bfor\s+him\b/i,
        /\bunisex\b/i,
    ];

    for (const pattern of patterns) {
        const match = productName.match(pattern);
        if (match) {
            return genderPhraseHighlightTokens(match[0]);
        }
    }

    return [];
}

export function extractGenderMarkerFromTitle(title: string): "m" | "l" | "u" | null {
    const match = title.match(/\(\s*([mlwu])\s*\)/i);
    if (!match) {
        return null;
    }

    const letter = match[1].toLowerCase();
    if (letter === "m") {
        return "m";
    }
    if (letter === "l") {
        return "l";
    }
    if (letter === "u") {
        return "u";
    }

    return null;
}

export function findGenderMarkerHighlightRange(text: string): NameMatchHighlightRange | null {
    const match = text.match(/\(\s*[mlwu]\s*\)/i);
    if (!match || match.index === undefined) {
        return null;
    }

    return {
        start: match.index,
        end: match.index + match[0].length,
    };
}

/** l'empreinte (→ lempreinte) ≡ empreinte после normalizeSearchText. */
export function productNameTokensEquivalent(left: string, right: string): boolean {
    if (left === right) {
        return true;
    }

    if (isGenderCanonToken(left) && isGenderCanonToken(right)) {
        return true;
    }

    const stripFrenchArticle = (token: string): string | null => {
        if (token.length < 3) {
            return null;
        }
        const prefix = token[0];
        if (prefix !== "l" && prefix !== "d") {
            return null;
        }
        const rest = token.slice(1);
        return rest.length >= 2 ? rest : null;
    };

    const leftStripped = stripFrenchArticle(left);
    const rightStripped = stripFrenchArticle(right);

    if (leftStripped && leftStripped === right) {
        return true;
    }
    if (rightStripped && rightStripped === left) {
        return true;
    }

    return false;
}

function comparableNameTokens(value: string): string[] {
    return filterMatcherTokens(
        normalizeMatcherProductText(value).split(" ").filter(Boolean),
    );
}

/** Токены для подсветки — пол и «Pour Homme» остаются обычными словами, не __linkgm__. */
function highlightProductNameTokens(productName: string, brandName?: string | null): string[] {
    let normalized = normalizeMatcherProductBaseText(productName);
    normalized = stripBrandPrefixNormalized(normalized, brandName);

    if (normalized === "") {
        return [];
    }

    return normalized
        .split(" ")
        .filter((token) => token.length >= 2);
}

function highlightSupplierProductNameTokens(
    productName: string,
    supplierBrand: string,
    catalogBrand: string,
): string[] {
    const tokens = highlightProductNameTokens(productName, supplierBrand || null);
    if (tokens.length > 0 || !catalogBrand || supplierBrand) {
        return tokens;
    }

    const normalized = normalizeMatcherProductBaseText(productName);
    for (const variant of brandPrefixNormalizedVariants(catalogBrand)) {
        if (normalized === variant) {
            return [];
        }
        if (normalized.startsWith(`${variant} `)) {
            return highlightProductNameTokens(normalized.slice(variant.length).trim(), "");
        }
    }

    return tokens;
}

/** Токены имени продукта после снятия бренда — как CatalogProductLinkNameTokenizer::variantMatchTokens. */
export function matcherProductNameTokens(productName: string, brandName?: string | null): string[] {
    let normalized = applyGenderCanonicalTokens(normalizeMatcherProductText(productName));
    normalized = stripBrandPrefixNormalized(normalized, brandName);

    if (normalized === "") {
        return [];
    }

    return normalized
        .split(" ")
        .filter((token) => token.length >= 2 || isGenderCanonToken(token));
}

export function stripBrandPrefixFromName(brandName: string, productName: string): string {
    const brand = brandName.trim();
    const name = productName.trim();
    if (!brand || !name) {
        return name;
    }

    const pattern = new RegExp(`^${escapeRegExp(brand)}\\s+`, "iu");
    if (!pattern.test(name)) {
        return name;
    }

    return name.replace(pattern, "").trim() || name;
}

function phraseHighlightTokens(phrase: string): string[] {
    return highlightProductNameTokens(phrase, "");
}

function resolveCatalogBrandPrefix(supplierBrand: string, catalogBrand: string): string | null {
    if (!catalogBrand.trim()) {
        return null;
    }

    if (supplierBrand.trim() && !brandsHighlightEquivalent(supplierBrand, catalogBrand)) {
        return null;
    }

    return catalogBrand;
}

function catalogPhraseHighlightTokens(catalogLabel: string, catalogBrand: string): string[] {
    const tokens = phraseHighlightTokens(catalogLabel);
    const brandTokens = phraseHighlightTokens(catalogBrand);

    return tokens.filter(
        (token) => token.length >= 2 || brandTokens.includes(token),
    );
}

export function getRowCatalogBrandName(row: SellerOneSupplierProductItem): string {
    return (
        row.linked_variant?.brand_name
        || row.suggested_variant?.brand_name
        || row.suggested_product?.brand_name
        || row.parsed?.brand
        || ""
    ).trim();
}

export function getRowCatalogProductNameOnly(row: SellerOneSupplierProductItem): string {
    return (
        row.linked_variant?.product_name
        || row.suggested_variant?.product_name
        || row.suggested_product?.name
        || ""
    ).trim();
}


/**
 * Нормализованные слова для подсветки в обеих колонках.
 * exact — зелёная фраза; иначе жёлтые общие слова.
 */
export function findProductNameMatchInfo(
    supplierLabel: string,
    catalogLabel: string,
    options?: {
        catalogBrand?: string;
        isLinked?: boolean;
    },
): ProductNameMatchInfo {
    const catalogBrand = options?.catalogBrand?.trim() || "";
    const brandPrefix = options?.isLinked && catalogBrand ? catalogBrand : null;
    const supplierNorm = normalizeMatcherProductText(supplierLabel);
    const catalogNorm = normalizeMatcherProductText(catalogLabel);
    if (!supplierNorm || !catalogNorm) {
        return { words: [], catalogWords: [], exact: false, brandPrefix: null };
    }

    if (isExactProductNameMatch(supplierLabel, catalogLabel)) {
        const words = comparableNameTokens(supplierLabel);
        const catalogWords = catalogPhraseHighlightTokens(catalogLabel, catalogBrand);
        const catalogBrandPrefix = resolveCatalogBrandPrefix(catalogBrand, catalogBrand);
        return {
            words,
            catalogWords: catalogBrandPrefix
                ? catalogPhraseHighlightTokens(
                    stripBrandPrefixFromName(catalogBrand, catalogLabel),
                    "",
                )
                : catalogWords,
            exact: true,
            brandPrefix,
            catalogBrandPrefix,
        };
    }

    const supplierTokens = filterMatcherTokens(supplierNorm.split(" ").filter(Boolean));
    const catalogTokens = filterMatcherTokens(catalogNorm.split(" ").filter(Boolean));
    const words = [...new Set(
        coreMatcherTokens(supplierTokens).filter((word) =>
            catalogTokens.some((catalogToken) => productNameTokensEquivalent(word, catalogToken)),
        ),
    )];

    const catalogCore = subsequenceMatchedCatalogWords(
        coreMatcherTokens(supplierTokens).join(" "),
        coreMatcherTokens(catalogTokens).join(" "),
    );
    const brandWords = brandPrefix ? phraseHighlightTokens(brandPrefix) : [];
    const catalogWords = brandWords.length > 0
        ? [...brandWords, ...catalogCore]
        : subsequenceMatchedCatalogWords(supplierNorm, catalogNorm);

    const catalogBrandPrefix = resolveCatalogBrandPrefix(
        options?.catalogBrand?.trim() || "",
        catalogBrand,
    );

    return {
        words,
        catalogWords: catalogBrandPrefix
            ? catalogCore
            : catalogWords,
        exact: false,
        brandPrefix: brandPrefix && words.length > 0 ? brandPrefix : null,
        catalogBrandPrefix,
    };
}

function resolveHighlightBrandPrefix(
    supplierBrand: string,
    catalogBrand: string,
    isLinked: boolean,
): string | null {
    if (supplierBrand) {
        return supplierBrand;
    }
    if (isLinked && catalogBrand) {
        return catalogBrand;
    }

    return null;
}

function alignSupplierProductTokens(
    supplierProductName: string,
    supplierBrand: string,
    catalogBrand: string,
): string[] {
    const tokens = matcherProductNameTokens(supplierProductName, supplierBrand);
    if (supplierBrand || !catalogBrand) {
        return tokens;
    }

    const normalized = applyGenderCanonicalTokens(normalizeMatcherProductText(supplierProductName));
    for (const variant of brandPrefixNormalizedVariants(catalogBrand)) {
        if (normalized === variant) {
            return [];
        }
        if (normalized.startsWith(`${variant} `)) {
            return matcherProductNameTokens(normalized.slice(variant.length).trim(), "");
        }
    }

    return tokens;
}

/**
 * Подсветка строки прайса: учитывает parsed.brand + product_name и уровень матча с бэкенда.
 */
export function findSellerOneRowNameMatchInfo(
    row: SellerOneSupplierProductItem,
    catalogLabel: string | null,
): ProductNameMatchInfo {
    if (!catalogLabel) {
        return { words: [], catalogWords: [], exact: false, brandPrefix: null };
    }

    const supplierBrand = row.parsed?.brand?.trim() || "";
    const supplierProductName = row.parsed?.product_name?.trim() || "";
    const catalogBrand = getRowCatalogBrandName(row);
    const catalogProductName = getRowCatalogProductNameOnly(row);
    const brandPrefix = resolveHighlightBrandPrefix(supplierBrand, catalogBrand, row.is_linked);
    const catalogBrandPrefix = resolveCatalogBrandPrefix(supplierBrand, catalogBrand);
    const nameMatchLevel = row.match_confidence_breakdown?.name_match_level;
    const backendNameExact = nameMatchLevel === "exact" || nameMatchLevel === "exact_multiset";
    const supplierGenderMarker = extractGenderMarkerFromTitle(row.external_name);

    const supplierTokensForMatch = supplierProductName
        ? alignSupplierProductTokens(supplierProductName, supplierBrand, catalogBrand)
        : [];
    const catalogTokensForMatch = catalogProductName
        ? matcherProductNameTokens(catalogProductName, catalogBrand)
        : [];

    const tokensExact = supplierTokensForMatch.length > 0
        && catalogTokensForMatch.length > 0
        && supplierTokensForMatch.length === catalogTokensForMatch.length
        && supplierTokensForMatch.every((token, index) =>
            productNameTokensEquivalent(token, catalogTokensForMatch[index]),
        );
    const linkedExact = row.is_linked && tokensExact;
    const highlightStrong = isStrongNameHighlight(nameMatchLevel)
        || backendNameExact
        || tokensExact
        || linkedExact;

    if (supplierProductName && catalogProductName) {
        const words = buildMatchedHighlightWords(
            supplierProductName,
            supplierBrand,
            catalogBrand,
            catalogProductName,
        );
        const catalogWords = buildCatalogHighlightWords(
            supplierProductName,
            supplierBrand || catalogBrand,
            catalogProductName,
            catalogBrand,
        );

        if (highlightStrong || words.length > 0) {
            return {
                words,
                catalogWords,
                exact: highlightStrong,
                brandPrefix,
                catalogBrandPrefix,
                supplierGenderMarker: highlightStrong
                    && supplierGenderMarker
                    && supplierGenderMarkerAlignsWithCatalog(supplierGenderMarker, catalogTokensForMatch)
                    ? supplierGenderMarker
                    : null,
            };
        }
    }

    if (supplierProductName) {
        const catalogTokens = catalogProductName
            ? matcherProductNameTokens(catalogProductName, catalogBrand)
            : matcherProductNameTokens(
                stripBrandPrefixFromName(catalogBrand, catalogLabel),
                catalogBrand,
            );

        const words = buildMatchedHighlightWords(
            supplierProductName,
            supplierBrand,
            catalogBrand,
            catalogProductName || stripBrandPrefixFromName(catalogBrand, catalogLabel),
        );

        const catalogWords = catalogProductName
            ? buildCatalogHighlightWords(
                supplierProductName,
                supplierBrand || catalogBrand,
                catalogProductName,
                catalogBrand,
            )
            : buildCatalogHighlightWords(
                supplierProductName,
                supplierBrand || catalogBrand,
                stripBrandPrefixFromName(catalogBrand, catalogLabel),
                catalogBrand,
            );

        return {
            words,
            catalogWords,
            exact: false,
            brandPrefix: brandPrefix && (words.length > 0 || supplierGenderMarker) ? brandPrefix : null,
            catalogBrandPrefix,
            supplierGenderMarker: supplierGenderMarker
                && supplierGenderMarkerAlignsWithCatalog(supplierGenderMarker, catalogTokens)
                ? supplierGenderMarker
                : null,
        };
    }

    return findProductNameMatchInfo(
        buildSupplierParsedLabel(row.parsed, row.external_name),
        catalogLabel,
        { catalogBrand, isLinked: row.is_linked },
    );
}

export function isExactProductNameMatch(sourceName: string, candidateName: string): boolean {
    const leftTokens = comparableNameTokens(sourceName);
    const rightTokens = comparableNameTokens(candidateName);
    if (leftTokens.length === 0 || leftTokens.length !== rightTokens.length) {
        return false;
    }

    return leftTokens.every((token, index) => productNameTokensEquivalent(token, rightTokens[index]));
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

export function mergeHighlightRanges(ranges: NameMatchHighlightRange[]): NameMatchHighlightRange[] {
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

function brandPrefixWordsForHighlight(normalizedVariant: string): string[] {
    const parts = normalizedVariant.split(" ").filter((word) => word.length > 0);
    if (parts.length > 1) {
        // V Canto, Y SL и т.п. — однобуквенные части бренда тоже входят в префикс.
        return parts;
    }

    return parts.filter((word) => word.length >= 2);
}

/** Подсветка префикса бренда в начале строки поставщика («V Canto …», Women'Secret …). */
export function findBrandPrefixHighlightRange(
    text: string,
    brandPrefix: string,
): NameMatchHighlightRange | null {
    if (!text || !brandPrefix.trim()) {
        return null;
    }

    for (const variant of brandPrefixNormalizedVariants(brandPrefix)) {
        const brandWords = brandPrefixWordsForHighlight(variant);
        if (brandWords.length === 0) {
            continue;
        }

        const pattern = brandWords.map(normalizedWordToFlexiblePattern).join(FLEXIBLE_WORD_GAP);
        const re = new RegExp(`^${pattern}`, "giu");
        const match = re.exec(text);
        if (!match) {
            continue;
        }

        const start = match.index;
        const end = extendParenWrappedSuffix(text, start, start + match[0].length);

        return { start, end };
    }

    return null;
}

export type ProductNameMatchInfo = {
    words: string[];
    /** Слова каталога по подпоследовательности (без лишних дублей вроде второго «Armani»). */
    catalogWords: string[];
    exact: boolean;
    /** Префикс бренда из parsed — подсветка в колонке поставщика (V Canto, …). */
    brandPrefix?: string | null;
    /** Префикс бренда каталога — подсветка в колонке каталога целиком («Victoria's Secret …»). */
    catalogBrandPrefix?: string | null;
    /** (M)/(L)/(U) в строке поставщика — подсветка при совпадении пола с каталогом. */
    supplierGenderMarker?: "m" | "l" | "u" | null;
};

function filterMatcherTokens(tokens: string[]): string[] {
    return tokens.filter((token) => token.length >= 2 || isGenderCanonToken(token));
}

function coreMatcherTokens(tokens: string[]): string[] {
    return tokens.filter((token) => !isGenderCanonToken(token));
}

/** Повтор бренда в середине линии (Iceberg Eau De Iceberg …) — не подсвечивать. */
function isSupplierInlineBrandWordToken(token: string, brandName: string): boolean {
    if (!brandName.trim()) {
        return false;
    }

    for (const variant of brandPrefixNormalizedVariants(brandName)) {
        for (const brandWord of variant.split(" ").filter((part) => part.length >= 2)) {
            if (token === brandWord) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Общие токены: подпоследовательность слева направо.
 * Лишние слова в каталоге или повтор бренда у поставщика пропускаются.
 */
function subsequenceMatchedHighlightPair(
    supplierTokens: string[],
    catalogTokens: string[],
    supplierBrand = "",
): { supplierWords: string[]; catalogWords: string[] } {
    const supplierWords: string[] = [];
    const catalogWords: string[] = [];
    let catalogIndex = 0;

    for (const supplierToken of supplierTokens) {
        let scanIndex = catalogIndex;
        while (scanIndex < catalogTokens.length) {
            if (productNameTokensEquivalent(supplierToken, catalogTokens[scanIndex])) {
                supplierWords.push(supplierToken);
                catalogWords.push(catalogTokens[scanIndex]);
                catalogIndex = scanIndex + 1;
                break;
            }
            scanIndex += 1;
        }

        if (
            scanIndex >= catalogTokens.length
            && isSupplierInlineBrandWordToken(supplierToken, supplierBrand)
        ) {
            continue;
        }
    }

    return { supplierWords, catalogWords };
}

function tokensMultisetEqual(left: string[], right: string[]): boolean {
    if (left.length !== right.length) {
        return false;
    }

    const counts = new Map<string, number>();
    for (const token of left) {
        const key = token.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    for (const token of right) {
        const key = token.toLowerCase();
        const count = counts.get(key);
        if (!count) {
            return false;
        }
        if (count === 1) {
            counts.delete(key);
        } else {
            counts.set(key, count - 1);
        }
    }

    return counts.size === 0;
}

/**
 * Общие токены: подпоследовательность, либо тот же набор слов в другом порядке (VI … Secret ≡ … Secret VI).
 */
function matchedHighlightPair(
    supplierTokens: string[],
    catalogTokens: string[],
    supplierBrand = "",
): { supplierWords: string[]; catalogWords: string[] } {
    const subsequence = subsequenceMatchedHighlightPair(supplierTokens, catalogTokens, supplierBrand);

    if (!tokensMultisetEqual(supplierTokens, catalogTokens)) {
        return subsequence;
    }

    const supplierWords = supplierTokens.filter(
        (token) => !isSupplierInlineBrandWordToken(token, supplierBrand),
    );

    return {
        supplierWords,
        catalogWords: [...catalogTokens],
    };
}

function buildCatalogHighlightWords(
    supplierProductName: string,
    supplierBrand: string,
    catalogProductName: string,
    catalogBrand: string,
): string[] {
    const supplierHighlight = highlightSupplierProductNameTokens(
        supplierProductName,
        supplierBrand,
        catalogBrand,
    );
    const catalogHighlight = highlightProductNameTokens(catalogProductName, catalogBrand);
    const supplierMatcher = alignSupplierProductTokens(supplierProductName, supplierBrand, catalogBrand);
    const catalogMatcher = matcherProductNameTokens(catalogProductName, catalogBrand);

    const supplierCore = coreMatcherTokens(supplierHighlight);
    const catalogCoreTokens = coreMatcherTokens(catalogHighlight);
    const matchedPair = matchedHighlightPair(supplierCore, catalogCoreTokens, supplierBrand);

    const genderMatched = supplierMatcher.some(isGenderCanonToken)
        && catalogMatcher.some(isGenderCanonToken);

    const genderWords = genderMatched
        ? extractGenderHighlightWords(catalogProductName).filter((word) => !matchedPair.catalogWords.includes(word))
        : [];

    return [...matchedPair.catalogWords, ...genderWords];
}

function subsequenceMatchedCatalogWordsFromTokens(
    supplierTokens: string[],
    catalogTokens: string[],
): string[] {
    const matched: string[] = [];
    let supplierIndex = 0;

    for (const catalogToken of catalogTokens) {
        if (
            supplierIndex < supplierTokens.length
            && productNameTokensEquivalent(catalogToken, supplierTokens[supplierIndex])
        ) {
            matched.push(catalogToken);
            supplierIndex += 1;
        }
    }

    return matched;
}

function subsequenceMatchedCatalogWords(supplierNorm: string, catalogNorm: string): string[] {
    return subsequenceMatchedCatalogWordsFromTokens(
        filterMatcherTokens(supplierNorm.split(" ").filter(Boolean)),
        filterMatcherTokens(catalogNorm.split(" ").filter(Boolean)),
    );
}

function isStrongNameHighlight(nameMatchLevel?: string): boolean {
    return nameMatchLevel === "exact"
        || nameMatchLevel === "exact_multiset"
        || nameMatchLevel === "partial"
        || nameMatchLevel === "catalog_extra";
}

function supplierGenderMarkerAlignsWithCatalog(
    marker: "m" | "l" | "u" | null,
    catalogTokens: string[],
): boolean {
    if (!marker) {
        return false;
    }
    if (marker === "l") {
        return catalogTokens.includes(GENDER_CANON_FEMALE);
    }
    if (marker === "m") {
        return catalogTokens.includes(GENDER_CANON_MALE);
    }

    return catalogTokens.includes(GENDER_CANON_UNISEX);
}

function buildMatchedHighlightWords(
    supplierProductName: string,
    supplierBrand: string,
    catalogBrand: string,
    catalogProductName: string,
): string[] {
    const supplierHighlight = highlightSupplierProductNameTokens(
        supplierProductName,
        supplierBrand,
        catalogBrand,
    );
    const catalogHighlight = highlightProductNameTokens(catalogProductName, catalogBrand);

    return matchedHighlightPair(
        coreMatcherTokens(supplierHighlight),
        coreMatcherTokens(catalogHighlight),
        supplierBrand,
    ).supplierWords;
}

/**
 * Подсветка каталога: по одному вхождению каждого слова, слева направо (подпоследовательность).
 */
export function findSubsequenceHighlightRanges(
    text: string,
    normalizedWords: string[],
    searchFrom = 0,
): NameMatchHighlightRange[] {
    if (!text || normalizedWords.length === 0) {
        return [];
    }

    const ranges: NameMatchHighlightRange[] = [];
    let cursor = Math.max(0, searchFrom);

    for (const word of normalizedWords) {
        if (word.length < 2) {
            continue;
        }

        const re = new RegExp(
            `\\b${normalizedWordToFlexiblePattern(word)}\\b`,
            "giu",
        );
        re.lastIndex = cursor;
        const match = re.exec(text);
        if (!match) {
            continue;
        }

        const start = match.index;
        const end = extendParenWrappedSuffix(text, start, start + match[0].length);
        ranges.push({ start, end });
        cursor = end;
    }

    return ranges;
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
    if (confidence >= 100) {
        return "bg-green-100 text-green-700";
    }
    if (confidence >= 90) {
        return "bg-amber-100 text-amber-700";
    }
    if (confidence >= 80) {
        return "bg-yellow-100 text-yellow-800";
    }
    if (confidence >= 50) {
        return "bg-orange-100 text-orange-800";
    }
    return "bg-red-100 text-red-700";
}

export type SupplierVariantHint = {
    volume: number | null;
    volumeIsMultipack?: boolean;
    volumeMultipackCount?: number | null;
    volumeMultipackUnitMl?: number | null;
    concentration: string | null;
    isTester: boolean;
    isVial: boolean;
};

export type VariantMatchFlags = {
    volume: boolean;
    concentration: boolean;
    /** Совпадение флага тестера (только если {@see testerRelevant}). */
    tester: boolean;
    /** Показывать и учитывать тестер: у поставщика test/tester или вариант — тестер. */
    testerRelevant: boolean;
    /** Совпадение флага пробника (только если {@see vialRelevant}). */
    vial: boolean;
    vialRelevant: boolean;
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
        return "parfum";
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

export function normalizeVolumeMl(value: number): number {
    return Math.round(value * 100) / 100;
}

export function volumesMatch(left: number | null | undefined, right: number | null | undefined): boolean {
    if (left == null || right == null) {
        return false;
    }

    return normalizeVolumeMl(left) === normalizeVolumeMl(right);
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
    if (hint.volumeIsMultipack) {
        return false;
    }

    if (hint.volume == null) {
        return true;
    }

    const variantVolume = getVariantVolumeMl(variant);
    if (variantVolume == null) {
        return false;
    }

    return volumesMatch(variantVolume, hint.volume);
}

export function definitionMatchesVolumeHint(
    definition: Pick<VariantDefinitionItem, "volume_ml">,
    hint: SupplierVariantHint,
): boolean {
    if (hint.volumeIsMultipack) {
        return false;
    }

    if (hint.volume == null) {
        return true;
    }

    if (definition.volume_ml == null) {
        return false;
    }

    return volumesMatch(Number(definition.volume_ml), hint.volume);
}

export function getVariantMatchFlags(
    variant: {
        volume?: number | null;
        concentration?: string | null;
        definition?: {
            volume_ml?: number;
            concentration_code?: string;
            is_tester?: boolean;
            is_vial?: boolean;
        } | null;
    },
    hint: SupplierVariantHint,
): VariantMatchFlags {
    const variantVolume = getVariantVolumeMl(variant);
    const variantConcentration = variant.concentration ?? variant.definition?.concentration_code ?? null;
    const variantIsTester = Boolean(variant.definition?.is_tester);
    const variantIsVial = Boolean(variant.definition?.is_vial);

    const volume =
        !hint.volumeIsMultipack
        && hint.volume != null
        && variantVolume != null
        && volumesMatch(Number(variantVolume), hint.volume);

    const hintConcentration = normalizeConcentrationCode(hint.concentration);
    const concentration =
        hintConcentration !== ""
        && normalizeConcentrationCode(variantConcentration) === hintConcentration;

    const testerRelevant = hint.isTester || variantIsTester;
    const tester = variantIsTester === hint.isTester;

    const vialRelevant = hint.isVial || variantIsVial;
    const vial = variantIsVial === hint.isVial;

    const score =
        (volume ? 70 : 0)
        + (concentration ? 30 : 0)
        + (testerRelevant && tester ? 20 : 0)
        + (vialRelevant && vial ? 20 : 0);

    return { volume, concentration, tester, testerRelevant, vial, vialRelevant, score };
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
                is_vial: definition.is_vial,
            },
        },
        hint,
    );
}

export function isFullVariantMatch(flags: VariantMatchFlags): boolean {
    return flags.volume
        && flags.concentration
        && (!flags.testerRelevant || flags.tester)
        && (!flags.vialRelevant || flags.vial);
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
    if (
        hint.volumeIsMultipack
        && hint.volumeMultipackCount != null
        && hint.volumeMultipackUnitMl != null
    ) {
        return `${hint.volumeMultipackCount}*${hint.volumeMultipackUnitMl}`;
    }

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

/** Браузерный сбой сети (не HTTP-ответ API): чаще всего таймаут/502 под нагрузкой. */
export function isTransientNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    const message = error.message.toLowerCase();

    return message === "failed to fetch"
        || message.includes("networkerror")
        || message.includes("network request failed")
        || message.includes("load failed");
}

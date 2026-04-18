import type { ProductAdminItem } from "@/lib/admin-products-api";
import type { AdminProductVariantItem } from "@/lib/admin-product-variants-api";
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

export function getConfidenceBadgeClass(confidence: number): string {
    if (confidence >= 95) {
        return "bg-green-100 text-green-700";
    }
    if (confidence >= 80) {
        return "bg-amber-100 text-amber-700";
    }
    return "bg-red-100 text-red-700";
}

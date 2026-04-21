import type { StockReceiptImportUnresolvedRow } from "./types";

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

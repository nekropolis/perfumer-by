import type { ReactNode } from "react";

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Термины для подсветки: полная строка, stem до « - », слова, снятие бренда с префикса. */
export function collectAdminSearchHighlightTerms(query: string, brandName?: string | null): string[] {
    const q = query.trim();
    if (!q) {
        return [];
    }

    const terms = new Set<string>();
    const add = (value: string) => {
        const t = value.trim();
        if (t.length >= 2 || /^\d+$/.test(t)) {
            terms.add(t);
        }
    };

    add(q);

    const stem = q.replace(/\s+-\s*.*$/u, "").trim();
    if (stem !== q) {
        add(stem);
    }

    for (const part of q.split(/\s+/u)) {
        add(part);
    }

    const brand = brandName?.trim() ?? "";
    if (brand !== "") {
        const brandPrefix = new RegExp(`^${escapeRegExp(brand)}(?:\\s+|$)`, "iu");
        if (brandPrefix.test(q)) {
            add(brand);
        }

        const stripped = q.replace(new RegExp(`^${escapeRegExp(brand)}\\s+`, "iu"), "").trim();
        if (stripped !== "" && stripped !== q) {
            add(stripped);
            const strippedStem = stripped.replace(/\s+-\s*.*$/u, "").trim();
            if (strippedStem !== stripped) {
                add(strippedStem);
            }
            for (const part of stripped.split(/\s+/u)) {
                add(part);
            }
        }
    }

    return [...terms].sort((a, b) => b.length - a.length);
}

type HighlightRange = { start: number; end: number };

function mergeHighlightRanges(ranges: HighlightRange[]): HighlightRange[] {
    if (ranges.length === 0) {
        return [];
    }

    const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
    const merged: HighlightRange[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i += 1) {
        const current = sorted[i];
        const last = merged[merged.length - 1];
        if (current.start <= last.end) {
            last.end = Math.max(last.end, current.end);
        } else {
            merged.push({ ...current });
        }
    }

    return merged;
}

export function highlightAdminSearchTerms(
    text: string,
    query: string,
    brandName?: string | null,
): ReactNode {
    const terms = collectAdminSearchHighlightTerms(query, brandName);
    if (!terms.length) {
        return text;
    }

    const lowerText = text.toLocaleLowerCase("ru-RU");
    const ranges: HighlightRange[] = [];

    for (const term of terms) {
        const lowerTerm = term.toLocaleLowerCase("ru-RU");
        let pos = 0;
        for (let i = 0; i < 80 && pos < text.length; i += 1) {
            const idx = lowerText.indexOf(lowerTerm, pos);
            if (idx === -1) {
                break;
            }
            ranges.push({ start: idx, end: idx + term.length });
            pos = idx + lowerTerm.length;
        }
    }

    const merged = mergeHighlightRanges(ranges);
    if (merged.length === 0) {
        return text;
    }

    const parts: ReactNode[] = [];
    let cursor = 0;

    merged.forEach((range, index) => {
        if (range.start > cursor) {
            parts.push(text.slice(cursor, range.start));
        }
        parts.push(
            <mark
                key={`hl-${range.start}-${index}`}
                className="rounded-sm bg-amber-200 px-0.5 text-admin-text"
            >
                {text.slice(range.start, range.end)}
            </mark>,
        );
        cursor = range.end;
    });

    if (cursor < text.length) {
        parts.push(text.slice(cursor));
    }

    return <>{parts}</>;
}

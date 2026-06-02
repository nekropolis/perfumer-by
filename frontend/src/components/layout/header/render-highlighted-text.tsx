import type { ReactNode } from "react";
import { collectAdminSearchHighlightTerms } from "@/lib/admin-search-highlight";

type RenderHighlightedTextOptions = {
    highlightClassName?: string;
    brandName?: string | null;
};

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

export function renderHighlightedText(
    text: string,
    query: string,
    options?: RenderHighlightedTextOptions,
): ReactNode {
    const terms = collectAdminSearchHighlightTerms(query, options?.brandName);
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

    const highlightClassName =
        options?.highlightClassName ?? "rounded bg-[#EFE6F0] px-0.5 text-inherit";

    const parts: ReactNode[] = [];
    let cursor = 0;

    merged.forEach((range, index) => {
        if (range.start > cursor) {
            parts.push(
                <span key={`plain-${range.start}-${index}`}>{text.slice(cursor, range.start)}</span>,
            );
        }
        parts.push(
            <mark key={`hl-${range.start}-${index}`} className={highlightClassName}>
                {text.slice(range.start, range.end)}
            </mark>,
        );
        cursor = range.end;
    });

    if (cursor < text.length) {
        parts.push(<span key="plain-tail">{text.slice(cursor)}</span>);
    }

    return <>{parts}</>;
}

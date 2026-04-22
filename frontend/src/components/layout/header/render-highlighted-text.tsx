import type { ReactNode } from "react";

type RenderHighlightedTextOptions = {
    highlightClassName?: string;
};

export function renderHighlightedText(
    text: string,
    query: string,
    options?: RenderHighlightedTextOptions,
): ReactNode {
    const needle = query.trim();

    if (!needle) {
        return text;
    }

    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "ig");
    const parts = text.split(regex);
    const highlightClassName =
        options?.highlightClassName ?? "rounded bg-[#EFE6F0] px-0.5 text-inherit";

    return parts.map((part, index) => {
        const isMatch = part.toLowerCase() === needle.toLowerCase();

        if (!isMatch) {
            return <span key={`${part}-${index}`}>{part}</span>;
        }

        return (
            <mark key={`${part}-${index}`} className={highlightClassName}>
                {part}
            </mark>
        );
    });
}

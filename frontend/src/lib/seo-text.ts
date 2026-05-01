export function stripHtml(input?: string | null): string {
    if (!input) return "";
    return input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function truncateByWords(text: string, maxLength = 160): string {
    if (text.length <= maxLength) return text;

    const sliced = text.slice(0, maxLength);
    const lastSpace = sliced.lastIndexOf(" ");
    const cut = lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced;
    return `${cut.trim()}…`;
}

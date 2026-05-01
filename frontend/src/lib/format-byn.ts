/**
 * Отображение суммы в BYN с двумя знаками после запятой.
 * Значения из API — строки, без float.
 */
export function formatBynAmountDisplay(raw: string | null | undefined): string {
    if (raw == null) {
        return "";
    }
    const s = String(raw).trim();
    if (!s) {
        return "";
    }
    const normalized = s.replace(",", ".").replace(/\s+/g, "");
    const [intPart, fracPart = ""] = normalized.split(".");
    const frac2 = (fracPart + "00").slice(0, 2);
    return `${intPart}.${frac2}`;
}

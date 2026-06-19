/** Парсит число из поля ввода: принимает и «1.3», и «1,3». */
export function parseDecimalInput(raw: string): number | null {
    const normalized = raw.trim().replace(/\s+/g, "").replace(",", ".");
    if (normalized === "") {
        return null;
    }

    const n = Number.parseFloat(normalized);
    if (!Number.isFinite(n)) {
        return null;
    }

    return Math.round(n * 10) / 10;
}

/** Для отображения в форме: целые без дроби, дробные с запятой (шаг 0,1). */
export function formatDecimalInputValue(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    if (Number.isInteger(rounded)) {
        return String(rounded);
    }

    return String(rounded).replace(".", ",");
}

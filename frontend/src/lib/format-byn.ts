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

/**
 * Копейки из десятичной строки (точка или запятая).
 * Пустое и нечисловое значение → 0, как прежний parseFloat-fallback.
 * Лишние знаки округляются от нуля по третьему знаку. Без parseFloat.
 */
export function parseMoneyMinorUnits(raw: string | null | undefined): number {
    if (raw == null) {
        return 0;
    }
    const normalized = String(raw).trim().replace(",", ".");
    const match = /^([+-])?(\d*)(?:\.(\d+))?/.exec(normalized);
    if (!match || !/\d/.test(match[0])) {
        return 0;
    }
    const negative = match[1] === "-";
    const whole = match[2] ? Number(match[2]) : 0;
    const frac = match[3] ?? "";
    let minor = whole * 100 + Number((frac + "00").slice(0, 2));
    const roundDigit = frac.length > 2 ? frac.charCodeAt(2) - 48 : 0;
    if (roundDigit >= 5) {
        minor += 1;
    }
    return negative ? -minor : minor;
}

/** Обратно в строку с двумя знаками и точкой. */
export function formatMoneyMinorUnits(minor: number): string {
    const negative = minor < 0;
    const abs = Math.abs(minor);
    const whole = Math.floor(abs / 100);
    const cents = abs % 100;
    return `${negative ? "-" : ""}${whole}.${cents.toString().padStart(2, "0")}`;
}

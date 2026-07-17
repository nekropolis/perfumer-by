/** Максимум цифр для международного / free-digit номера (E.164 без «+»). */
export const ADMIN_PHONE_MAX_DIGITS = 15;

/**
 * Нормализует ввод для поиска/создания заказа в админке:
 * — ≤9 цифр → белорусский national, дописываем 375;
 * — ≥10 цифр → полный номер как есть (международный или полный 375…).
 */
export function normalizeAdminPhoneSearchDigits(input: string): string {
    const digits = input.replace(/\D/g, "");
    if (digits.length === 0) {
        return "";
    }
    if (digits.length <= 9) {
        return `375${digits}`;
    }
    return digits.slice(0, ADMIN_PHONE_MAX_DIGITS);
}

/** Свободный ввод цифр в поле быстрого поиска (до 15). */
export function clampAdminPhoneSearchInput(input: string): string {
    return input.replace(/\D/g, "").slice(0, ADMIN_PHONE_MAX_DIGITS);
}

export function isAdminPhoneSearchReady(input: string): boolean {
    const digits = input.replace(/\D/g, "");
    if (digits.length >= 10) {
        return true;
    }
    return digits.length >= 5;
}

export function isAdminPhoneContextReady(input: string): boolean {
    const digits = input.replace(/\D/g, "");
    if (digits.length >= 10) {
        return true;
    }
    return digits.length >= 9;
}

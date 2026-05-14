/** Код страны без «+». */
export const BELARUS_PHONE_PREFIX = "375";

/**
 * Нормализует ввод (в т.ч. копипаст +375 (…) …) в 9 цифр национальной части после 375.
 * Убирает нецифры; при ведущем 375 отрезает его; дальше не больше 9 цифр.
 */
export function clampBelarusNationalDigits(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith(BELARUS_PHONE_PREFIX)) {
    return digits.slice(BELARUS_PHONE_PREFIX.length).slice(0, 9);
  }
  return digits.slice(0, 9);
}

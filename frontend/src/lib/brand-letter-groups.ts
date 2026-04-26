/** Порядок сортировки букв с непустыми группами (кириллица, латиница, «#»). */
const BRAND_NAV_ALPHABET: readonly string[] = [
    "А",
    "Б",
    "В",
    "Г",
    "Д",
    "Е",
    "Ё",
    "Ж",
    "З",
    "И",
    "Й",
    "К",
    "Л",
    "М",
    "Н",
    "О",
    "П",
    "Р",
    "С",
    "Т",
    "У",
    "Ф",
    "Х",
    "Ц",
    "Ч",
    "Ш",
    "Щ",
    "Ъ",
    "Ы",
    "Ь",
    "Э",
    "Ю",
    "Я",
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V",
    "W",
    "X",
    "Y",
    "Z",
    "#",
];

const navAlphabetSet = new Set(BRAND_NAV_ALPHABET);

/**
 * Буквы с непустыми группами: сначала в порядке BRAND_NAV_ALPHABET, затем любые внешние ключи.
 */
export function orderedLettersWithBrands<T>(groups: Map<string, T[]>): string[] {
    const fromNav = BRAND_NAV_ALPHABET.filter((letter) => (groups.get(letter)?.length ?? 0) > 0);
    const extra = [...groups.keys()].filter((k) => !navAlphabetSet.has(k));
    extra.sort((a, b) => a.localeCompare(b, "ru"));
    return [...fromNav, ...extra];
}

/**
 * Группировка брендов по первой букве имени (как в фильтре каталога).
 */
export function groupBrandsByFirstLetter<T extends { name: string }>(items: T[]): Map<string, T[]> {
    const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const groups = new Map<string, T[]>();
    for (const item of sorted) {
        const first = item.name.trim().charAt(0).toUpperCase() || "#";
        const letter = /[A-ZА-ЯЁ]/.test(first) ? first : "#";
        const bucket = groups.get(letter) ?? [];
        bucket.push(item);
        groups.set(letter, bucket);
    }
    return groups;
}

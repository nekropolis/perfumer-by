export type CatalogCuratedPage =
    | "catalog"
    | "sale"
    | "new"
    | "hit"
    | "female"
    | "male"
    | "unisex";

export function resolveCatalogCuratedPage(
    sp: Record<string, string | undefined>,
): CatalogCuratedPage {
    if (sp.sale === "1") return "sale";
    if (sp.hit === "1") return "hit";
    if (sp.new === "1") return "new";
    const gender = sp.gender?.trim();
    if (gender === "female" || gender === "male" || gender === "unisex") {
        return gender;
    }
    return "catalog";
}

const CATALOG_PAGE_COPY: Record<
    CatalogCuratedPage,
    { title: string; h1: string; description: string; breadcrumb: string; intro: string }
> = {
    catalog: {
        title: "Купить парфюмерию в Минске и Беларуси — каталог | Perfumer",
        h1: "Каталог парфюмерии",
        description:
            "Оригинальная парфюмерия: женские, мужские и унисекс ароматы. Люксовые и нишевые бренды, пробники и тестеры. Доставка по Минску и Беларуси.",
        breadcrumb: "Каталог",
        intro: "Оригинальная парфюмерия для женщин и мужчин — люксовые и нишевые бренды с доставкой по Беларуси.",
    },
    sale: {
        title: "Акции на парфюмерию — скидки и спецпредложения | Perfumer",
        h1: "Акции",
        description:
            "Акционные предложения оригинальной парфюмерии: скидки на бренды, объёмы и тестеры. Доставка по Минску и Беларуси.",
        breadcrumb: "Акции",
        intro: "Акционные предложения оригинальной парфюмерии с доставкой по Беларуси.",
    },
    new: {
        title: "Новинки парфюмерии — свежие ароматы | Perfumer",
        h1: "Новинки",
        description:
            "Новинки оригинальной парфюмерии: свежие поступления люксовых и нишевых ароматов с доставкой по Беларуси.",
        breadcrumb: "Новинки",
        intro: "Свежие ароматы и новые поступления оригинальной парфюмерии.",
    },
    hit: {
        title: "Хиты продаж парфюмерии — популярные ароматы | Perfumer",
        h1: "Хиты",
        description:
            "Хиты продаж оригинальной парфюмерии: ароматы, которые чаще всего выбирают покупатели. Доставка по Минску и Беларуси.",
        breadcrumb: "Хиты",
        intro: "Популярные ароматы, которые чаще всего выбирают покупатели.",
    },
    female: {
        title: "Женская парфюмерия — купить в Минске и Беларуси | Perfumer",
        h1: "Женская парфюмерия",
        description:
            "Женская оригинальная парфюмерия: люксовые и нишевые ароматы, тестеры и миниатюры. Доставка по Минску и Беларуси.",
        breadcrumb: "Женские",
        intro: "Женские ароматы — от свежих дневных до шлейфовых вечерних композиций.",
    },
    male: {
        title: "Мужская парфюмерия — купить в Минске и Беларуси | Perfumer",
        h1: "Мужская парфюмерия",
        description:
            "Мужская оригинальная парфюмерия: классика и современные ароматы, тестеры и миниатюры. Доставка по Минску и Беларуси.",
        breadcrumb: "Мужские",
        intro: "Мужские ароматы — классические и современные композиции с доставкой по Беларуси.",
    },
    unisex: {
        title: "Унисекс парфюмерия — купить в Минске и Беларуси | Perfumer",
        h1: "Унисекс парфюмерия",
        description:
            "Унисекс оригинальная парфюмерия: ароматы без привязки к полу, люкс и ниша. Доставка по Минску и Беларуси.",
        breadcrumb: "Унисекс",
        intro: "Унисекс-ароматы для тех, кто выбирает парфюмерию без жёстких рамок.",
    },
};

export function getCatalogPageCopy(sp: Record<string, string | undefined>) {
    const base = CATALOG_PAGE_COPY[resolveCatalogCuratedPage(sp)];
    const page = Math.max(1, Number(sp.page || "1") || 1);
    if (page <= 1) {
        return base;
    }
    return {
        ...base,
        title: `${base.title.replace(/\s*\|\s*Perfumer\s*$/, "")} — страница ${page} | Perfumer`,
        h1: `${base.h1} — страница ${page}`,
        description: `${base.description.replace(/\.\s*$/, "")}. Страница ${page}.`,
    };
}

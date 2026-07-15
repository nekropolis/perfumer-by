export type CatalogCuratedPage = "catalog" | "sale" | "new" | "hit";

export function resolveCatalogCuratedPage(
    sp: Record<string, string | undefined>,
): CatalogCuratedPage {
    if (sp.sale === "1") return "sale";
    if (sp.new === "1") return "new";
    if (sp.hit === "1") return "hit";
    return "catalog";
}

const CATALOG_PAGE_COPY: Record<
    CatalogCuratedPage,
    { title: string; description: string; breadcrumb: string; intro: string }
> = {
    catalog: {
        title: "Каталог парфюмерии",
        description: "Каталог парфюмерии с выбором брендов, вариантов и цен.",
        breadcrumb: "Каталог",
        intro: "Оригинальная парфюмерия для женщин и мужчин — люксовые и нишевые бренды с доставкой по Беларуси.",
    },
    sale: {
        title: "Акции",
        description: "Акционные предложения парфюмерии с выбором брендов, вариантов и цен.",
        breadcrumb: "Акции",
        intro: "Акционные предложения оригинальной парфюмерии с доставкой по Беларуси.",
    },
    new: {
        title: "Новинки",
        description: "Новинки парфюмерии — свежие ароматы с выбором брендов, вариантов и цен.",
        breadcrumb: "Новинки",
        intro: "Свежие ароматы и новые поступления оригинальной парфюмерии.",
    },
    hit: {
        title: "Хиты",
        description: "Хиты продаж парфюмерии — популярные ароматы с выбором брендов, вариантов и цен.",
        breadcrumb: "Хиты",
        intro: "Популярные ароматы, которые чаще всего выбирают покупатели.",
    },
};

export function getCatalogPageCopy(sp: Record<string, string | undefined>) {
    return CATALOG_PAGE_COPY[resolveCatalogCuratedPage(sp)];
}

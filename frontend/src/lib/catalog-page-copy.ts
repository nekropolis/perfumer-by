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
    { title: string; description: string; breadcrumb: string }
> = {
    catalog: {
        title: "Каталог парфюмерии",
        description: "Каталог парфюмерии с выбором брендов, вариантов и цен.",
        breadcrumb: "Каталог",
    },
    sale: {
        title: "Акции",
        description: "Акционные предложения парфюмерии с выбором брендов, вариантов и цен.",
        breadcrumb: "Акции",
    },
    new: {
        title: "Новинки",
        description: "Новинки парфюмерии — свежие ароматы с выбором брендов, вариантов и цен.",
        breadcrumb: "Новинки",
    },
    hit: {
        title: "Хиты",
        description: "Хиты продаж парфюмерии — популярные ароматы с выбором брендов, вариантов и цен.",
        breadcrumb: "Хиты",
    },
};

export function getCatalogPageCopy(sp: Record<string, string | undefined>) {
    return CATALOG_PAGE_COPY[resolveCatalogCuratedPage(sp)];
}

import { describe, expect, it } from "vitest";
import {
    BRAND_DEFAULT_SORT,
    CATALOG_DEFAULT_SORT,
    buildCatalogProductsQuery,
    listingPathWithQuery,
    listingQueryWithPage,
    toPublicListingQueryParams,
} from "./catalog-listing-query";
import { catalogCanonicalPath, catalogListingFilterActive, resolveListingPaginationLinks } from "./seo";
import { getCatalogPageCopy } from "./catalog-page-copy";
import { catalogCollectionJsonLd } from "./json-ld";

describe("catalog default sort SEO sync", () => {
    it("treats popular as default and does not mark bare /catalog as filtered", () => {
        expect(catalogListingFilterActive({})).toBe(false);
        expect(catalogListingFilterActive({ sort: CATALOG_DEFAULT_SORT })).toBe(false);
        expect(catalogListingFilterActive({ sort: "price_asc" })).toBe(true);
        expect(catalogListingFilterActive({ page: "2" })).toBe(false);
    });

    it("indexes curated menu landings (sale/new/hit/gender)", () => {
        expect(catalogListingFilterActive({ sale: "1" })).toBe(false);
        expect(catalogListingFilterActive({ new: "1" })).toBe(false);
        expect(catalogListingFilterActive({ hit: "1" })).toBe(false);
        expect(catalogListingFilterActive({ gender: "female" })).toBe(false);
        expect(catalogListingFilterActive({ sale: "1", page: "2" })).toBe(false);
        expect(catalogListingFilterActive({ sale: "1", brand: "dior" })).toBe(true);
        expect(catalogListingFilterActive({ sale: "1", new: "1" })).toBe(true);
    });

    it("builds API query with popular by default", () => {
        const query = buildCatalogProductsQuery({});
        expect(query.get("sort")).toBe(CATALOG_DEFAULT_SORT);
    });

    it("strips default sort and page=1 from public listing URLs", () => {
        const apiQuery = buildCatalogProductsQuery({ page: "1" });
        const publicQuery = listingQueryWithPage(apiQuery, 2, { defaultSort: CATALOG_DEFAULT_SORT });
        expect(publicQuery.get("sort")).toBeNull();
        expect(publicQuery.get("page")).toBe("2");
        expect(listingPathWithQuery("/catalog", publicQuery)).toBe("/catalog?page=2");

        const page1 = listingQueryWithPage(apiQuery, 1, { defaultSort: CATALOG_DEFAULT_SORT });
        expect(listingPathWithQuery("/catalog", page1)).toBe("/catalog");
    });

    it("publishes gender= instead of attr_2 for gender landings", () => {
        const apiQuery = buildCatalogProductsQuery({ gender: "female", page: "2" });
        expect(apiQuery.get("attr_2")).toBeTruthy();
        const publicQuery = listingQueryWithPage(apiQuery, 2, { defaultSort: CATALOG_DEFAULT_SORT });
        expect(publicQuery.get("gender")).toBe("female");
        expect(publicQuery.get("attr_2")).toBeNull();
        expect(listingPathWithQuery("/catalog", publicQuery)).toContain("gender=female");
        expect(listingPathWithQuery("/catalog", publicQuery)).toContain("page=2");
    });

    it("strips brand_slug from public brand pagination query", () => {
        const query = new URLSearchParams({
            page: "1",
            brand_slug: "hugo-boss",
            sort: BRAND_DEFAULT_SORT,
        });
        const publicQuery = toPublicListingQueryParams(query, {
            defaultSort: BRAND_DEFAULT_SORT,
        });
        publicQuery.delete("page");
        expect(publicQuery.toString()).toBe("");
    });

    it("builds rel=next without default sort", () => {
        const pagination = resolveListingPaginationLinks({
            basePath: "/catalog",
            query: buildCatalogProductsQuery({}),
            currentPage: 1,
            lastPage: 10,
            defaultSort: CATALOG_DEFAULT_SORT,
        });
        expect(pagination?.next).toMatch(/\/catalog\?page=2$/);
        expect(pagination?.next).not.toContain("sort=");
    });

    it("keeps sale in rel=next for curated landings", () => {
        const pagination = resolveListingPaginationLinks({
            basePath: "/catalog",
            query: buildCatalogProductsQuery({ sale: "1" }),
            currentPage: 1,
            lastPage: 3,
            defaultSort: CATALOG_DEFAULT_SORT,
        });
        expect(pagination?.next).toContain("/catalog?");
        expect(pagination?.next).toContain("sale=1");
        expect(pagination?.next).toContain("page=2");
    });
});

describe("catalogCanonicalPath", () => {
    it("keeps curated query on indexable landings", () => {
        expect(catalogCanonicalPath({ sale: "1" })).toBe("/catalog?sale=1");
        expect(catalogCanonicalPath({ gender: "male", page: "2" })).toBe("/catalog?gender=male&page=2");
        expect(catalogCanonicalPath({ sale: "1", brand: "x" })).toBe("/catalog?sale=1");
    });
});

describe("getCatalogPageCopy", () => {
    it("keeps short h1 and stronger meta on page 1", () => {
        const copy = getCatalogPageCopy({});
        expect(copy.h1).toBe("Каталог парфюмерии");
        expect(copy.title).toContain("Минске");
        expect(copy.description).toContain("Доставка");
    });

    it("uses gender landing copy", () => {
        const copy = getCatalogPageCopy({ gender: "female" });
        expect(copy.h1).toBe("Женская парфюмерия");
        expect(copy.title).toContain("Женская");
    });

    it("appends page number for pagination", () => {
        const copy = getCatalogPageCopy({ page: "3" });
        expect(copy.h1).toBe("Каталог парфюмерии — страница 3");
        expect(copy.title).toContain("страница 3");
        expect(copy.description).toContain("Страница 3");
    });
});

describe("catalogCollectionJsonLd", () => {
    it("emits CollectionPage with ItemList of product URLs", () => {
        const ld = catalogCollectionJsonLd({
            name: "Каталог парфюмерии",
            description: "Описание",
            urlPath: "/catalog",
            products: [
                {
                    name: "Alive",
                    display_name: "Hugo Boss Alive Eau de Parfum",
                    slug: "hugo-boss-boss-alive",
                    brand: { name: "Hugo Boss" },
                },
            ],
        });

        expect(ld["@type"]).toBe("CollectionPage");
        const mainEntity = ld.mainEntity as Record<string, unknown>;
        expect(mainEntity["@type"]).toBe("ItemList");
        const items = mainEntity.itemListElement as Array<Record<string, unknown>>;
        expect(items).toHaveLength(1);
        expect(items[0]?.name).toBe("Hugo Boss Alive Eau de Parfum");
        expect(String(items[0]?.url)).toContain("/hugo-boss-boss-alive");
    });
});

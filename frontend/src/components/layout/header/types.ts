export type HeaderNavLink = {
    label: string;
    href: string;
};

export type HeaderSearchItem = {
    id: number;
    name: string;
    display_name?: string | null;
    slug: string;
    brand_name: string | null;
    variant_titles: string[];
    image?: string | null;
    price_range?: {
        min: string | null;
        max: string | null;
    };
    is_new?: boolean;
    is_hit?: boolean;
    has_discount?: boolean;
    is_out_of_stock?: boolean;
    is_preorder_available?: boolean;
    /** Свободный остаток по вариантам (учёт резерва) — для подписи в подсказке поиска */
    stock_total?: number;
    matched_code?: string | null;
    score?: number;
};

export type HeaderSearchBrandItem = {
    id: number;
    name: string;
    slug: string;
    products_count: number;
    score?: number;
};

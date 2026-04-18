export type ProductVariantData = {
    id: number;
    volume: number | null;
    volume_unit: string | null;
    type: string | null;
    concentration: string | null;
    edition: string | null;
    display_name: string;
    price: string | null;
    old_price: string | null;
    discount_percent: number | null;
    stock: number;
    is_preorder: boolean;
    is_active: boolean;
    is_available: boolean;
};

export type ProductAttributeOptionData = {
    id: number;
    name: string;
    sort_order: number;
};

export type ProductAttributeValueData = {
    id: number;
    custom_value: string | null;
    sort_order: number;
    attribute: {
        id: number;
        name: string;
        type: "text" | "select" | "multiselect";
        options: ProductAttributeOptionData[];
    } | null;
    selected_options: ProductAttributeOptionData[];
};

export type ProductImageData = {
    id: number;
    path: string;
    is_main: boolean;
    sort_order: number;
};

export type ProductListItem = {
    id: number;
    name: string;
    slug: string;
    h1: string | null;
    short_description: string | null;
    variant_labels: string[];

    brand: {
        id: number;
        name: string;
    } | null;

    main_category: {
        id: number;
        name: string;
        slug: string;
    } | null;

    image: string | null;

    is_new: boolean;
    is_hit: boolean;
    is_out_of_stock: boolean;

    price_range: {
        min: string | null;
        max: string | null;
    };

    old_price_range: {
        min: string | null;
        max: string | null;
    };

    has_discount: boolean;
    discount_percent: number | null;

    stock_total: number;
    is_preorder_available: boolean;
    variants_count: number;
};

export type ProductsResponse = {
    data: ProductListItem[];
    meta: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
};

export type ProductDetailData = {
    id: number;
    is_out_of_stock: boolean;
    name: string;
    slug: string;
    h1: string | null;
    short_description: string | null;
    description: string | null;
    seo_title: string | null;
    seo_description: string | null;

    brand: {
        id: number;
        name: string;
        slug: string;
    } | null;

    main_category: {
        id: number;
        name: string;
        slug: string;
    } | null;

    categories: {
        id: number;
        name: string;
        slug: string;
    }[];

    images: ProductImageData[];
    attribute_values: ProductAttributeValueData[];

    price_range: {
        min: string | null;
        max: string | null;
    };

    stock_total: number;
    variants: ProductVariantData[];
    default_variant_id: number | null;
};

export type ProductDetailResponse = {
    data: ProductDetailData;
};

export type CatalogBrandItem = {
    id: number;
    name: string;
    slug: string;
};

export type CatalogBrandsResponse = {
    data: CatalogBrandItem[];
};

export type CatalogBrandDetailResponse = {
    data: {
        id: number;
        name: string;
        slug: string;
    };
};

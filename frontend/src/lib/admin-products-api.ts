import { getAuthToken } from "@/lib/auth-token";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

function getAdminHeaders() {
    const token = typeof window !== "undefined" ? getAuthToken() : "";

    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

export type ProductAdminItem = {
    id: number;
    name: string;
    slug: string;
    is_active: boolean;
    is_new: boolean;
    is_hit: boolean;
    discounted_variants_count?: number;
    is_out_of_stock?: boolean;
    variants_count: number;
    brand: {
        id: number;
        name: string;
        slug: string;
    } | null;
};

export type ProductsAdminResponse = {
    data: ProductAdminItem[];
    current_page: number;
    last_page: number;
    total: number;
};

export type ProductBrandOption = {
    id: number;
    name: string;
    slug: string;
};

export type ProductSmartSearchItem = {
    id: number;
    name: string;
    brand_name: string | null;
    variant_titles: string[];
    score: number;
};

export type ProductBrandsOptionsResponse = {
    data: ProductBrandOption[];
};

export type ProductSmartSearchResponse = {
    data: ProductSmartSearchItem[];
};

export type ProductAdminDetail = {
    id: number;
    name: string;
    slug: string;
    is_active: boolean;
    is_new: boolean;
    is_hit: boolean;
    is_out_of_stock?: boolean;
    h1?: string | null;
    short_description?: string | null;
    description?: string | null;
    seo_title?: string | null;
    seo_description?: string | null;

    brand: {
        id: number;
        name: string;
        slug: string;
    } | null;

    variants_count: number;

    variants?: Array<{
        id: number;
        title: string;
        display_name?: string;
        volume?: number | null;
        volume_unit?: string | null;
        type?: string | null;
        price?: string | null;
        old_price?: string | null;
        stock?: number;
        is_active?: boolean;
    }>;

    images?: Array<{
        id: number;
        path: string;
        is_main?: boolean;
        sort_order?: number;
    }>;

    attribute_values?: Array<{
        id: number;
        custom_value?: string | null;
        sort_order: number;
        attribute: {
            id: number;
            name: string;
            type: "text" | "select" | "multiselect";
            options?: Array<{
                id: number;
                name: string;
                sort_order: number;
            }>;
        } | null;
        selected_options?: Array<{
            id: number;
            name: string;
            sort_order: number;
        }>;
    }>;
};

export type ProductAdminDetailResponse = {
    data: ProductAdminDetail;
};

export type ProductVariantSupplierItem = {
    id: number;
    title: string;
    site_price?: number | string | null;
    stock: number;
    warehouses: Array<{
        warehouse_name: string | null;
        stock: number;
        available_stock: number;
    }>;
    suppliers: Array<{
        offer_id: number;
        supplier_name: string | null;
        supplier_code: string | null;
        supplier_product_name: string | null;
        supplier_price: number | string | null;
    }>;
    receipt_batches: Array<{
        receipt_item_id: number;
        receipt_id: number;
        receipt_document_no: string | null;
        supplier_name: string | null;
        supplier_code: string | null;
        supplier_product_name: string | null;
        supplier_price: number | string | null;
        warehouse_name: string | null;
        qty: number;
        received_at: string | null;
    }>;
};

export type ProductVariantSuppliersResponse = {
    data: ProductVariantSupplierItem[];
};

export async function fetchProducts(params?: {
    search?: string;
    page?: number;
    brand_id?: number;
    out_of_stock?: "" | "1" | "0";
    status?: "" | "new" | "hit" | "discount";
}): Promise<ProductsAdminResponse> {
    const searchParams = new URLSearchParams();

    if (params?.search) {
        searchParams.set("search", params.search);
    }

    if (params?.page) {
        searchParams.set("page", String(params.page));
    }
    if (params?.brand_id) {
        searchParams.set("brand_id", String(params.brand_id));
    }
    if (params?.out_of_stock === "1" || params?.out_of_stock === "0") {
        searchParams.set("out_of_stock", params.out_of_stock);
    }
    if (params?.status) {
        searchParams.set("status", params.status);
    }

    const query = searchParams.toString();
    const url = `${API_BASE}/admin/products${query ? `?${query}` : ""}`;
    const res = await fetch(url, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Products API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchProductBrandOptions(): Promise<ProductBrandsOptionsResponse> {
    const res = await fetch(`${API_BASE}/admin/products/brands/options`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Product brands options API error: ${res.status}`);
    }

    return res.json();
}

export async function smartSearchProducts(params: {
    q: string;
    limit?: number;
}): Promise<ProductSmartSearchResponse> {
    const searchParams = new URLSearchParams();
    searchParams.set("q", params.q);
    if (params.limit) {
        searchParams.set("limit", String(params.limit));
    }
    const query = searchParams.toString();

    const res = await fetch(`${API_BASE}/admin/products/search-smart?${query}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Product smart search API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchProductById(id: number | string): Promise<ProductAdminDetailResponse> {
    const res = await fetch(`${API_BASE}/admin/products/${id}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Product detail API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchProductVariantSuppliers(id: number): Promise<ProductVariantSuppliersResponse> {
    const res = await fetch(`${API_BASE}/admin/products/${id}/variant-suppliers`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Product variant suppliers API error: ${res.status}`);
    }

    return res.json();
}

export async function createProduct(payload: {
    brand_id: number;
    name: string;
    slug: string;
    is_active?: boolean;
    is_new?: boolean;
    is_hit?: boolean;
    h1?: string;
    short_description?: string;
    description?: string;
    seo_title?: string;
    seo_description?: string;
}) {
    const res = await fetch(`${API_BASE}/admin/products`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Create product API error: ${res.status}`);
    }

    return res.json();
}

export async function updateProduct(
    id: number,
    payload: {
        brand_id: number;
        name: string;
        slug: string;
        is_active?: boolean;
        is_new?: boolean;
        is_hit?: boolean;
        h1?: string;
        short_description?: string;
        description?: string;
        seo_title?: string;
        seo_description?: string;
    }
) {
    const res = await fetch(`${API_BASE}/admin/products/${id}`, {
        method: "PUT",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Update product API error: ${res.status}`);
    }

    return res.json();
}

export async function deleteProduct(id: number) {
    const res = await fetch(`${API_BASE}/admin/products/${id}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Delete product API error: ${res.status}`);
    }

    return res.json();
}

export async function resetCatalogApiCache(): Promise<{ message?: string; cache_version?: number }> {
    const res = await fetch(`${API_BASE}/admin/products/cache/reset`, {
        method: "POST",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Reset catalog cache API error: ${res.status}`);
    }

    return res.json() as Promise<{ message?: string; cache_version?: number }>;
}


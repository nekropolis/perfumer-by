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

export type AdminProductVariantItem = {
    id: number;
    variant_definition_id?: number | null;
    title: string;
    display_name?: string;
    volume?: number | null;
    volume_unit?: string | null;
    type?: string | null;
    concentration?: string | null;
    edition?: string | null;
    price?: string | null;
    old_price?: string | null;
    stock?: number;
    main_available_stock?: number;
    is_preorder?: boolean;
    is_active?: boolean;
    active_supplier_offers_count?: number;
    sort_order?: number;
    definition?: {
        id: number;
        title: string;
        volume_ml: number;
        concentration_code: string;
        concentration_label: string;
        is_tester: boolean;
    };
};

export type AdminProductVariantResponse = {
    data: AdminProductVariantItem;
    message?: string;
};

export type AdminProductVariantsResponse = {
    data: AdminProductVariantItem[];
};

export type ProductVariantPayload = {
    variant_definition_id?: number | null;
    price?: number | string | null;
    old_price?: number | string | null;
    stock?: number;
    is_preorder?: boolean;
    is_active?: boolean;
    sort_order?: number;
};

export type VariantDefinitionItem = {
    id: number;
    title: string;
    volume_ml: number;
    concentration_code: string;
    concentration_label: string;
    is_tester: boolean;
};

export type VariantDefinitionsResponse = {
    data: VariantDefinitionItem[];
    // Поля пагинации приходят, только если клиент передал ?page/?per_page
    // (см. ProductVariantAdminController::catalog).
    current_page?: number;
    last_page?: number;
    per_page?: number;
    total?: number;
};

export type VariantDefinitionPayload = {
    volume_ml: number;
    concentration_code: string;
    concentration_label: string;
    is_tester?: boolean;
    sort_order?: number;
};

export type VariantDefinitionResponse = {
    data: VariantDefinitionItem;
    message?: string;
};

export async function fetchVariantDefinition(
    id: number | string
): Promise<VariantDefinitionResponse> {
    const res = await fetch(`${API_BASE}/admin/products/variant-definitions/${id}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Fetch variant definition API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchProductVariants(
    productId: number | string
): Promise<AdminProductVariantsResponse> {
    const res = await fetch(`${API_BASE}/admin/products/${productId}/variants`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Fetch product variants API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchVariantDefinitions(params?: {
    search?: string;
    product_id?: number | string;
    page?: number;
    per_page?: number;
}): Promise<VariantDefinitionsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.search) {
        searchParams.set("search", params.search);
    }
    if (params?.product_id) {
        searchParams.set("product_id", String(params.product_id));
    }
    if (params?.page) {
        searchParams.set("page", String(params.page));
    }
    if (params?.per_page) {
        searchParams.set("per_page", String(params.per_page));
    }

    const query = searchParams.toString();
    const res = await fetch(
        `${API_BASE}/admin/products/variant-definitions${query ? `?${query}` : ""}`,
        {
            headers: getAdminHeaders(),
            cache: "no-store",
        }
    );

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Fetch variant definitions API error: ${res.status}`);
    }

    return res.json();
}

export async function createVariantDefinition(
    payload: VariantDefinitionPayload
): Promise<VariantDefinitionResponse> {
    const res = await fetch(`${API_BASE}/admin/products/variant-definitions`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Create variant definition API error: ${res.status}`);
    }

    return res.json();
}

export async function updateVariantDefinition(
    id: number | string,
    payload: VariantDefinitionPayload
): Promise<VariantDefinitionResponse> {
    const res = await fetch(`${API_BASE}/admin/products/variant-definitions/${id}`, {
        method: "PUT",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Update variant definition API error: ${res.status}`);
    }

    return res.json();
}

export async function deleteVariantDefinition(
    id: number | string
): Promise<{ message?: string }> {
    const res = await fetch(`${API_BASE}/admin/products/variant-definitions/${id}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Delete variant definition API error: ${res.status}`);
    }

    return res.json();
}

export async function createProductVariant(
    productId: number | string,
    payload: ProductVariantPayload
): Promise<AdminProductVariantResponse> {
    const res = await fetch(`${API_BASE}/admin/products/${productId}/variants`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Create product variant API error: ${res.status}`);
    }

    return res.json();
}

export async function updateProductVariant(
    productId: number | string,
    variantId: number | string,
    payload: ProductVariantPayload
): Promise<AdminProductVariantResponse> {
    const res = await fetch(
        `${API_BASE}/admin/products/${productId}/variants/${variantId}`,
        {
            method: "PUT",
            headers: getAdminHeaders(),
            body: JSON.stringify(payload),
            cache: "no-store",
        }
    );

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Update product variant API error: ${res.status}`);
    }

    return res.json();
}

export async function deleteProductVariant(
    productId: number | string,
    variantId: number | string
): Promise<{ message?: string }> {
    const res = await fetch(
        `${API_BASE}/admin/products/${productId}/variants/${variantId}`,
        {
            method: "DELETE",
            headers: getAdminHeaders(),
            cache: "no-store",
        }
    );

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Delete product variant API error: ${res.status}`);
    }

    return res.json();
}
import { getAuthToken } from "@/lib/auth-token";
import { readAdminJsonResponse } from "@/lib/admin-fetch-error";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

function getAdminHeaders() {
    const token = typeof window !== "undefined" ? getAuthToken() : "";

    return {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

export type AdminProductVariantItem = {
    id: number;
    variant_definition_id?: number | null;
    product_set_id?: number | null;
    title: string;
    display_name?: string;
    volume?: number | null;
    volume_unit?: string | null;
    type?: string | null;
    concentration?: string | null;
    edition?: string | null;
    price?: string | number | null;
    old_price?: string | number | null;
    stock?: number;
    main_available_stock?: number;
    /** Доступно для витрины/корзины (канал main → supplier прайс → supplier склад). */
    available_stock?: number;
    is_available?: boolean;
    fulfillment_tooltip?: string;
    is_preorder?: boolean;
    is_active?: boolean;
    is_promotion?: boolean;
    is_set?: boolean;
    active_supplier_offers_count?: number;
    /** Как цена уходит на витрину (null — не показываем «висячую» розницу без канала продаж). */
    catalog_list_price?: number | null;
    sort_order?: number;
    definition?: {
        id: number;
        title: string;
        volume_ml: number | null;
        volume_label?: string | null;
        concentration_code: string;
        concentration_label: string;
        is_tester: boolean;
        is_vial?: boolean;
        is_miniature?: boolean;
        is_set?: boolean;
        excludes_from_free_delivery_threshold?: boolean;
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
    is_promotion?: boolean;
    sort_order?: number;
};

export type VariantDefinitionItem = {
    id: number;
    title: string;
    volume_ml: number | null;
    volume_label?: string | null;
    concentration_code: string;
    concentration_label: string;
    is_tester: boolean;
    is_vial?: boolean;
    is_miniature?: boolean;
    is_set?: boolean;
    excludes_from_free_delivery_threshold?: boolean;
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
    volume_ml?: number | null;
    volume_label?: string | null;
    concentration_code?: string;
    concentration_label: string;
    is_tester?: boolean;
    is_vial?: boolean;
    is_miniature?: boolean;
    is_set?: boolean;
    excludes_from_free_delivery_threshold?: boolean;
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

    return readAdminJsonResponse<VariantDefinitionResponse>(
        res,
        `Fetch variant definition API error: ${res.status}`
    );
}

export async function fetchProductVariants(
    productId: number | string
): Promise<AdminProductVariantsResponse> {
    const res = await fetch(`${API_BASE}/admin/products/${productId}/variants`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    return readAdminJsonResponse<AdminProductVariantsResponse>(
        res,
        `Fetch product variants API error: ${res.status}`
    );
}

export async function fetchVariantDefinitions(params?: {
    search?: string;
    product_id?: number | string;
    is_set?: boolean;
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
    if (params?.is_set != null) {
        searchParams.set("is_set", params.is_set ? "1" : "0");
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

    return readAdminJsonResponse<VariantDefinitionsResponse>(
        res,
        `Fetch variant definitions API error: ${res.status}`
    );
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

    return readAdminJsonResponse<VariantDefinitionResponse>(
        res,
        "Не удалось создать вариант справочника"
    );
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

    return readAdminJsonResponse<VariantDefinitionResponse>(
        res,
        "Не удалось сохранить вариант справочника"
    );
}

export async function deleteVariantDefinition(
    id: number | string
): Promise<{ message?: string }> {
    const res = await fetch(`${API_BASE}/admin/products/variant-definitions/${id}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    return readAdminJsonResponse<{ message?: string }>(
        res,
        "Не удалось удалить вариант справочника"
    );
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

    return readAdminJsonResponse<AdminProductVariantResponse>(
        res,
        "Не удалось создать вариант товара"
    );
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

    return readAdminJsonResponse<AdminProductVariantResponse>(
        res,
        "Не удалось сохранить вариант товара"
    );
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

    return readAdminJsonResponse<{ message?: string }>(
        res,
        "Не удалось удалить вариант товара"
    );
}
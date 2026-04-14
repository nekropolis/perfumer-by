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
    is_preorder?: boolean;
    is_active?: boolean;
    sort_order?: number;
};

export type AdminProductVariantResponse = {
    data: AdminProductVariantItem;
    message?: string;
};

export type AdminProductVariantsResponse = {
    data: AdminProductVariantItem[];
};

export type ProductVariantPayload = {
    volume?: number | null;
    volume_unit?: string | null;
    type?: string | null;
    concentration?: string | null;
    edition?: string | null;
    price?: number | string | null;
    old_price?: number | string | null;
    stock?: number;
    is_preorder?: boolean;
    is_active?: boolean;
    sort_order?: number;
};

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
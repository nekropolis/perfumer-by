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

export type AttributeType = "text" | "select" | "multiselect";

export type ProductAttributeBindingOption = {
    id: number;
    name: string;
    sort_order: number;
};

export type ProductAttributeBindingAttribute = {
    id: number;
    name: string;
    type: AttributeType;
    options?: ProductAttributeBindingOption[];
};

export type ProductAttributeBindingItem = {
    id: number;
    custom_value?: string | null;
    sort_order: number;
    attribute: ProductAttributeBindingAttribute | null;
    selected_options?: ProductAttributeBindingOption[];
};

export async function createProductAttributeValue(
    productId: number | string,
    payload: {
        attribute_id: number;
        option_ids?: number[];
        custom_value?: string | null;
        sort_order?: number;
    }
) {
    const res = await fetch(`${API_BASE}/admin/products/${productId}/attribute-values`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Create product attribute value API error: ${res.status}`);
    }

    return res.json();
}

export async function updateProductAttributeValue(
    productId: number | string,
    valueId: number | string,
    payload: {
        option_ids?: number[];
        custom_value?: string | null;
        sort_order?: number;
    }
) {
    const res = await fetch(`${API_BASE}/admin/products/${productId}/attribute-values/${valueId}`, {
        method: "PUT",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Update product attribute value API error: ${res.status}`);
    }

    return res.json();
}

export async function deleteProductAttributeValue(
    productId: number | string,
    valueId: number | string,
) {
    const res = await fetch(`${API_BASE}/admin/products/${productId}/attribute-values/${valueId}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Delete product attribute value API error: ${res.status}`);
    }

    return res.json();
}

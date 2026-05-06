import { getAuthToken } from "@/lib/auth-token";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

function getAdminHeaders(): Record<string, string> {
    const token = typeof window !== "undefined" ? getAuthToken() : "";

    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

function getAdminAuthHeaders(): Record<string, string> {
    const token = typeof window !== "undefined" ? getAuthToken() : "";
    if (!token) {
        return {};
    }
    return { Authorization: `Bearer ${token}` };
}

export type ProductImagesResponse = {
    data: Array<{
        id: number;
        path: string;
        alt?: string | null;
        is_main: boolean;
        sort_order: number;
        usage_type?: "gallery" | "catalog";
        watermark_status?: string;
    }>;
};

export async function uploadProductImages(
    id: number,
    files: File[],
    options?: { usage_type?: "gallery" | "catalog" }
): Promise<ProductImagesResponse> {
    const body = new FormData();
    for (const file of files) {
        body.append("images[]", file);
    }
    if (options?.usage_type) {
        body.append("usage_type", options.usage_type);
    }

    const res = await fetch(`${API_BASE}/admin/products/${id}/images`, {
        method: "POST",
        headers: getAdminAuthHeaders(),
        body,
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Upload product images API error: ${res.status}`);
    }

    return res.json();
}

export async function reorderProductImages(id: number, imageIds: number[]): Promise<ProductImagesResponse> {
    const res = await fetch(`${API_BASE}/admin/products/${id}/images/reorder`, {
        method: "PUT",
        headers: getAdminHeaders(),
        body: JSON.stringify({ image_ids: imageIds }),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Reorder product images API error: ${res.status}`);
    }

    return res.json();
}

export async function setMainProductImage(id: number, imageId: number): Promise<ProductImagesResponse> {
    const res = await fetch(`${API_BASE}/admin/products/${id}/images/${imageId}/set-main`, {
        method: "PUT",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Set main product image API error: ${res.status}`);
    }

    return res.json();
}

export async function updateProductImageUsageType(
    id: number,
    imageId: number,
    usageType: "gallery" | "catalog"
): Promise<ProductImagesResponse> {
    const res = await fetch(`${API_BASE}/admin/products/${id}/images/${imageId}/usage-type`, {
        method: "PUT",
        headers: getAdminHeaders(),
        body: JSON.stringify({ usage_type: usageType }),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Update usage type API error: ${res.status}`);
    }

    return res.json();
}

export async function deleteProductImage(id: number, imageId: number): Promise<ProductImagesResponse> {
    const res = await fetch(`${API_BASE}/admin/products/${id}/images/${imageId}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Delete product image API error: ${res.status}`);
    }

    return res.json();
}

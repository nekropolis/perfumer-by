import { getAuthToken } from "@/lib/auth-token";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

function getAdminHeaders() {
    const token = getAuthToken();

    return {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
    };
}

export type AttributeType = "text" | "select" | "multiselect";

export type AttributeOptionAdminItem = {
    id: number;
    attribute_id: number;
    name: string;
    sort_order: number;
    is_active: boolean;
};

export type AttributeAdminItem = {
    id: number;
    name: string;
    type: AttributeType;
    sort_order: number;
    is_active: boolean;
    is_filterable: boolean;
    filter_sort_order: number;
    options_count?: number;
};

export type AttributeAdminDetail = {
    id: number;
    name: string;
    type: AttributeType;
    sort_order: number;
    is_active: boolean;
    is_filterable: boolean;
    filter_sort_order: number;
    options_count?: number;
    options?: AttributeOptionAdminItem[];
};

export type AttributesAdminResponse = {
    data: AttributeAdminItem[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

export type AttributeAdminDetailResponse = {
    data: AttributeAdminDetail;
};

export async function fetchAttributes(params?: {
    page?: number;
    search?: string;
    type?: AttributeType | "";
}): Promise<AttributesAdminResponse> {
    const searchParams = new URLSearchParams();

    if (params?.page) {
        searchParams.set("page", String(params.page));
    }

    if (params?.search) {
        searchParams.set("search", params.search);
    }

    if (params?.type) {
        searchParams.set("type", params.type);
    }

    const url = `${API_BASE}/admin/attributes${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

    const res = await fetch(url, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Attributes API error: ${res.status}`);
    }

    return res.json();
}

export async function fetchAttributeById(id: number | string): Promise<AttributeAdminDetailResponse> {
    const res = await fetch(`${API_BASE}/admin/attributes/${id}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Attribute detail API error: ${res.status}`);
    }

    return res.json();
}

export async function createAttribute(payload: {
    name: string;
    type: AttributeType;
    sort_order?: number;
    is_active?: boolean;
    is_filterable?: boolean;
    filter_sort_order?: number;
}) {
    const res = await fetch(`${API_BASE}/admin/attributes`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Create attribute API error: ${res.status}`);
    }

    return res.json();
}

export async function updateAttribute(
    id: number | string,
    payload: {
        name: string;
        type: AttributeType;
        sort_order?: number;
        is_active?: boolean;
        is_filterable?: boolean;
        filter_sort_order?: number;
    }
) {
    const res = await fetch(`${API_BASE}/admin/attributes/${id}`, {
        method: "PUT",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Update attribute API error: ${res.status}`);
    }

    return res.json();
}

export async function deleteAttribute(id: number | string) {
    const res = await fetch(`${API_BASE}/admin/attributes/${id}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Delete attribute API error: ${res.status}`);
    }

    return res.json();
}
export async function createAttributeOption(
    attributeId: number | string,
    payload: {
        name: string;
        sort_order?: number;
        is_active?: boolean;
    }
) {
    const res = await fetch(`${API_BASE}/admin/attributes/${attributeId}/options`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Create attribute option API error: ${res.status}`);
    }

    return res.json();
}

export async function updateAttributeOption(
    attributeId: number | string,
    optionId: number | string,
    payload: {
        name: string;
        sort_order?: number;
        is_active?: boolean;
    }
) {
    const res = await fetch(`${API_BASE}/admin/attributes/${attributeId}/options/${optionId}`, {
        method: "PUT",
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Update attribute option API error: ${res.status}`);
    }

    return res.json();
}

export async function deleteAttributeOption(
    attributeId: number | string,
    optionId: number | string,
) {
    const res = await fetch(`${API_BASE}/admin/attributes/${attributeId}/options/${optionId}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Delete attribute option API error: ${res.status}`);
    }

    return res.json();
}

export type AttributeBindingOptionItem = {
    id: number;
    name: string;
    sort_order: number;
};

export type AttributeBindingItem = {
    id: number;
    name: string;
    type: AttributeType;
    options: AttributeBindingOptionItem[];
};

export type AttributeBindingOptionsResponse = {
    data: AttributeBindingItem[];
};

export async function fetchAttributeBindingOptions(): Promise<AttributeBindingOptionsResponse> {
    const res = await fetch(`${API_BASE}/admin/attributes/binding-options`, {
        headers: getAdminHeaders(),
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Attribute binding options API error: ${res.status}`);
    }

    return res.json();
}

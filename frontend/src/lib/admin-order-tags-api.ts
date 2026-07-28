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

export type OrderTag = {
  id: number;
  name: string;
  color: string;
};

export type OrderTagPayload = {
  name: string;
  color: string;
};

export async function fetchOrderTags(params?: { search?: string }): Promise<{ data: OrderTag[] }> {
  const searchParams = new URLSearchParams();
  if (params?.search?.trim()) {
    searchParams.set("search", params.search.trim());
  }
  const query = searchParams.toString();
  const res = await fetch(`${API_BASE}/admin/order-tags${query ? `?${query}` : ""}`, {
    headers: getAdminHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Order tags API error: ${res.status}`);
  }
  return res.json();
}

export async function createOrderTag(payload: OrderTagPayload): Promise<{ data: OrderTag }> {
  const res = await fetch(`${API_BASE}/admin/order-tags`, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await parseOrderTagError(res, "Не удалось создать тег"));
  }
  return res.json();
}

export async function updateOrderTag(
  id: number,
  payload: OrderTagPayload,
): Promise<{ data: OrderTag }> {
  const res = await fetch(`${API_BASE}/admin/order-tags/${id}`, {
    method: "PUT",
    headers: getAdminHeaders(),
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await parseOrderTagError(res, "Не удалось обновить тег"));
  }
  return res.json();
}

export async function deleteOrderTag(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/order-tags/${id}`, {
    method: "DELETE",
    headers: getAdminHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Не удалось удалить тег (${res.status})`);
  }
}

async function parseOrderTagError(res: Response, fallback: string): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as {
      message?: string;
      errors?: Record<string, string[]>;
    };
    if (parsed.errors?.name?.[0]) {
      return parsed.errors.name[0];
    }
    if (parsed.message) {
      return parsed.message;
    }
  } catch {
    /* ignore */
  }
  return `${fallback} (${res.status})`;
}

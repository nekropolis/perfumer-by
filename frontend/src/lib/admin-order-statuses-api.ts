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

export type OrderStatus = {
  id: number;
  code: string;
  name: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  show_in_order_products: boolean;
};

export type OrderStatusPayload = {
  name: string;
  color: string;
  code?: string;
  sort_order?: number;
  is_active?: boolean;
  show_in_order_products?: boolean;
};

export async function fetchOrderStatuses(params?: {
  active?: boolean;
}): Promise<{ data: OrderStatus[] }> {
  const searchParams = new URLSearchParams();
  if (params?.active) {
    searchParams.set("active", "1");
  }
  const query = searchParams.toString();
  const res = await fetch(`${API_BASE}/admin/order-statuses${query ? `?${query}` : ""}`, {
    headers: getAdminHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Order statuses API error: ${res.status}`);
  }
  return res.json();
}

export async function createOrderStatus(
  payload: OrderStatusPayload,
): Promise<{ data: OrderStatus }> {
  const res = await fetch(`${API_BASE}/admin/order-statuses`, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await parseOrderStatusError(res, "Не удалось создать статус"));
  }
  return res.json();
}

export async function updateOrderStatus(
  id: number,
  payload: OrderStatusPayload,
): Promise<{ data: OrderStatus }> {
  const res = await fetch(`${API_BASE}/admin/order-statuses/${id}`, {
    method: "PUT",
    headers: getAdminHeaders(),
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await parseOrderStatusError(res, "Не удалось обновить статус"));
  }
  return res.json();
}

async function parseOrderStatusError(res: Response, fallback: string): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as {
      message?: string;
      errors?: Record<string, string[]>;
    };
    if (parsed.errors?.name?.[0]) {
      return parsed.errors.name[0];
    }
    if (parsed.errors?.code?.[0]) {
      return parsed.errors.code[0];
    }
    if (parsed.errors?.color?.[0]) {
      return parsed.errors.color[0];
    }
    if (parsed.message) {
      return parsed.message;
    }
  } catch {
    /* ignore */
  }
  return `${fallback} (${res.status})`;
}

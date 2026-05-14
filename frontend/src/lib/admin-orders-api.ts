import { getAuthToken } from "@/lib/auth-token";
import type { OrderResponse, OrdersResponse } from "@/types/orders";

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

export async function fetchOrders(params?: {
  search?: string;
  status?: string;
  /** today | week | month | year — фильтр по дате создания (игнорируется API, если задан from/to) */
  period?: string;
  /** YYYY-MM-DD — начало интервала created_at */
  from?: string;
  /** YYYY-MM-DD — конец интервала created_at (включительно, конец дня) */
  to?: string;
  page?: number;
  /** Только 25, 50 или 100 (остальное API приведёт к 25) */
  per_page?: number;
}): Promise<OrdersResponse> {
  const searchParams = new URLSearchParams();

  if (params?.search) {
    searchParams.set("search", params.search);
  }

  if (params?.status) {
    searchParams.set("status", params.status);
  }

  if (params?.period) {
    searchParams.set("period", params.period);
  }

  if (params?.from) {
    searchParams.set("from", params.from);
  }

  if (params?.to) {
    searchParams.set("to", params.to);
  }

  if (params?.page != null && params.page > 0) {
    searchParams.set("page", String(params.page));
  }

  if (params?.per_page != null && params.per_page > 0) {
    searchParams.set("per_page", String(params.per_page));
  }

  const query = searchParams.toString();
  const url = `${API_BASE}/admin/orders${query ? `?${query}` : ""}`;

  const res = await fetch(url, {
    headers: getAdminHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Orders API error: ${res.status}`);
  }

  return res.json();
}

export async function fetchOrder(id: number): Promise<OrderResponse> {
  const res = await fetch(`${API_BASE}/admin/orders/${id}`, {
    headers: getAdminHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Order API error: ${res.status}`);
  }

  return res.json();
}

export type OrdersStatsResponse = {
  data: {
    by_status: {
      new: number;
    };
  };
};

export async function fetchOrdersStats(signal?: AbortSignal): Promise<OrdersStatsResponse> {
  const res = await fetch(`${API_BASE}/admin/orders/stats`, {
    headers: getAdminHeaders(),
    cache: "no-store",
    signal,
  });

  if (!res.ok) {
    throw new Error(`Orders stats API error: ${res.status}`);
  }

  return res.json();
}

export async function updateOrderStatus(
  id: number,
  status: string,
): Promise<OrderResponse> {
  const res = await fetch(`${API_BASE}/admin/orders/${id}/status`, {
    method: "PATCH",
    headers: getAdminHeaders(),
    body: JSON.stringify({ status }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    let message = `Order status API error: ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (typeof parsed?.message === "string" && parsed.message.trim() !== "") {
        message = parsed.message;
      }
    } catch {
      if (text.trim() !== "") {
        message = text;
      }
    }
    throw new Error(message);
  }

  return res.json();
}

export async function syncOrderInventoryWriteoff(id: number): Promise<OrderResponse> {
  const res = await fetch(`${API_BASE}/admin/orders/${id}/sync-inventory-writeoff`, {
    method: "POST",
    headers: getAdminHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    let message = `Order inventory sync API error: ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (typeof parsed?.message === "string" && parsed.message.trim() !== "") {
        message = parsed.message;
      }
    } catch {
      if (text.trim() !== "") {
        message = text;
      }
    }
    throw new Error(message);
  }

  return res.json();
}

export type AdminOrderPayloadItem = {
  product_id?: number | null;
  variant_id?: number | null;
  product_name: string;
  product_slug?: string | null;
  brand_name?: string | null;
  variant_title: string;
  sku?: string | null;
  qty: number;
  price: number;
};

export type AdminOrderPayload = {
  customer_name?: string | null;
  phone: string;
  comment?: string | null;
  status?: string;
  delivery_method?: string | null;
  delivery_city?: string | null;
  delivery_address?: string | null;
  delivery_fee?: number;
  payment_method?: string | null;
  items: AdminOrderPayloadItem[];
};

export type AdminOrderCustomerContext = {
  matched_user: { id: number; name: string | null } | null;
  orders: {
    completed: number;
    cancelled: number;
    active: number;
  };
  delivery_cities: string[];
  discount_cards: { number: string; discount_percent: string }[];
  completed_orders: {
    id: number;
    created_at: string | null;
    items_qty: number;
    total: string;
    items: {
      product_name: string;
      variant_title: string;
      qty: number;
    }[];
  }[];
};

export async function fetchAdminOrderCustomerContext(phone: string): Promise<{ data: AdminOrderCustomerContext }> {
  const q = phone.trim() ? `?phone=${encodeURIComponent(phone.trim())}` : "";
  const res = await fetch(`${API_BASE}/admin/orders/customer-context${q}`, {
    headers: getAdminHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Customer context API error: ${res.status}`);
  }
  return res.json();
}

async function parseOrderError(res: Response, fallback: string): Promise<Error> {
  const text = await res.text();
  let message = fallback;
  try {
    const parsed = JSON.parse(text) as { message?: string };
    if (typeof parsed?.message === "string" && parsed.message.trim() !== "") {
      message = parsed.message;
    }
  } catch {
    if (text.trim() !== "") {
      message = text;
    }
  }
  return new Error(message);
}

export async function createOrder(payload: AdminOrderPayload): Promise<OrderResponse> {
  const res = await fetch(`${API_BASE}/admin/orders`, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    throw await parseOrderError(res, `Create order API error: ${res.status}`);
  }

  return res.json();
}

export async function updateOrder(id: number, payload: AdminOrderPayload): Promise<OrderResponse> {
  const res = await fetch(`${API_BASE}/admin/orders/${id}`, {
    method: "PUT",
    headers: getAdminHeaders(),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    throw await parseOrderError(res, `Update order API error: ${res.status}`);
  }

  return res.json();
}

export async function cancelOrder(id: number): Promise<OrderResponse> {
  const res = await fetch(`${API_BASE}/admin/orders/${id}`, {
    method: "DELETE",
    headers: getAdminHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw await parseOrderError(res, `Cancel order API error: ${res.status}`);
  }

  return res.json();
}

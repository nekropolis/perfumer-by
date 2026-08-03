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
  /** today | week | month | year — фильтр по дате отправки (игнорируется API, если задан from/to) */
  period?: string;
    /** YYYY-MM-DD — начало интервала shipment_date */
  from?: string;
  /** YYYY-MM-DD — конец интервала shipment_date (включительно) */
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
    overdue_delivery?: number;
  };
};

export async function fetchOrdersStats(
  signal?: AbortSignal,
): Promise<OrdersStatsResponse> {
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

export type AdminOrderFieldsPayload = {
  delivery_time_from?: string | null;
  delivery_time_to?: string | null;
  shipment_date?: string | null;
  delivery_date?: string | null;
  manager_comment?: string | null;
  tag_ids?: number[];
};

export async function updateOrderAdminFields(
  id: number,
  payload: AdminOrderFieldsPayload,
): Promise<OrderResponse> {
  const res = await fetch(`${API_BASE}/admin/orders/${id}/admin-fields`, {
    method: "PATCH",
    headers: getAdminHeaders(),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    throw await parseOrderError(
      res,
      `Order admin fields API error: ${res.status}`,
    );
  }

  return res.json();
}

export async function syncOrderInventoryWriteoff(
  id: number,
): Promise<OrderResponse> {
  const res = await fetch(
    `${API_BASE}/admin/orders/${id}/sync-inventory-writeoff`,
    {
      method: "POST",
      headers: getAdminHeaders(),
      cache: "no-store",
    },
  );

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
  availability_source?: string | null;
  waiting_discount?: boolean;
  stock_lot_allocations?: Array<{ lot_id: number; qty: number }>;
};

export type AdminOrderPayload = {
  customer_name?: string | null;
  phone: string;
  comment?: string | null;
  manager_comment?: string | null;
  status?: string;
  delivery_method?: string | null;
  delivery_city?: string | null;
  /** ID города Ветер (belarus_courier). */
  delivery_city_id?: number | null;
  delivery_address?: string | null;
  delivery_street_prefix?: string | null;
  delivery_house?: string | null;
  delivery_korpus?: string | null;
  delivery_apartment?: string | null;
  delivery_comment?: string | null;
  /** ID отправки (курьер Минск / РБ). */
  shipment_id?: string | null;
  /** YYYY-MM-DD — дата отправки */
  shipment_date?: string | null;
  /** YYYY-MM-DD — дата доставки (курьер) */
  delivery_date?: string | null;
  delivery_time_from?: string | null;
  delivery_time_to?: string | null;
  delivery_fee?: number;
  payment_method?: string | null;
  /** Номер активной скидочной карты; пусто — без скидки по карте. */
  discount_card_number?: string | null;
  /** Код подарочного сертификата для оплаты; пусто — без сертификата. */
  gift_certificate_code?: string | null;
  /** ID тегов заказа. */
  tag_ids?: number[];
  items: AdminOrderPayloadItem[];
};

export type AdminOrderQuote = {
  subtotal: string;
  loyalty_discount_percent: string;
  loyalty_discount_amount: string;
  discount_card_number: string | null;
  gift_certificate_code?: string | null;
  gift_certificate_amount?: string;
  delivery_fee: string;
  merchandise_total: string;
  total: string;
};

export type AdminOrderQuotePayload = {
  payment_method?: string | null;
  delivery_method?: string | null;
  discount_card_number?: string | null;
  gift_certificate_code?: string | null;
  order_id?: number | null;
  /** Используется только если delivery_method не передан. */
  delivery_fee?: number;
  items: { qty: number; price: number; variant_id?: number | null }[];
};

export type AdminOrderCustomerContext = {
  matched_user: { id: number; name: string | null } | null;
  /** Имя из профиля или последнего заказа по этому телефону. */
  customer_name?: string | null;
  orders: {
    completed: number;
    cancelled: number;
    active: number;
  };
  delivery_cities: string[];
  discount_cards: { number: string; discount_percent: string }[];
  completed_orders: AdminOrderCustomerContextOrderRow[];
  active_orders?: AdminOrderCustomerContextOrderRow[];
  cancelled_orders?: AdminOrderCustomerContextOrderRow[];
};

export type AdminOrderCustomerContextOrderRow = {
  id: number;
  created_at: string | null;
  items_qty: number;
  total: string;
  items: {
    product_name: string;
    variant_title: string;
    qty: number;
  }[];
};

export async function fetchAdminOrderQuote(
  payload: AdminOrderQuotePayload,
): Promise<{ data: AdminOrderQuote }> {
  const res = await fetch(`${API_BASE}/admin/orders/quote`, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) {
    throw await parseOrderError(
      res,
      `Admin order quote API error: ${res.status}`,
    );
  }
  return res.json();
}

export async function fetchAdminOrderCustomerContext(
  phone: string,
): Promise<{ data: AdminOrderCustomerContext }> {
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

async function parseOrderError(
  res: Response,
  fallback: string,
): Promise<Error> {
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

export async function createOrder(
  payload: AdminOrderPayload,
): Promise<OrderResponse> {
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

export async function updateOrder(
  id: number,
  payload: AdminOrderPayload,
): Promise<OrderResponse> {
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

export async function deleteOrder(id: number): Promise<{ message?: string }> {
  const res = await fetch(`${API_BASE}/admin/orders/${id}`, {
    method: "DELETE",
    headers: getAdminHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw await parseOrderError(res, `Delete order API error: ${res.status}`);
  }

  return res.json();
}

export type VeterSendSkipped = {
  order_id: number;
  reason: string;
};

export type VeterSendInvalid = {
  order_id: number;
  reason: string;
  missing: string[];
};

export type VeterSendResultData = {
  ready_order_ids: number[];
  skipped: VeterSendSkipped[];
  invalid: VeterSendInvalid[];
  sent: { order_id: number; shipment_id: string; status?: string }[];
  failed: { order_id: number; reason: string }[];
};

export async function sendVeterTickets(
  orderIds: number[],
): Promise<{ data: VeterSendResultData; message?: string }> {
  const res = await fetch(`${API_BASE}/admin/orders/veter-send`, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({ order_ids: orderIds }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw await parseOrderError(res, `Veter send API error: ${res.status}`);
  }

  return res.json();
}

export type VeterStatusSyncResultData = {
  updated: {
    order_id: number;
    shipment_id: string;
    shipment_status: string | null;
    shipment_date?: string | null;
    status?: string;
  }[];
  failed: { order_id: number; shipment_id: string; reason: string }[];
  total: number;
};

export async function syncVeterTicketStatuses(): Promise<{
  data: VeterStatusSyncResultData;
  message?: string;
}> {
  const res = await fetch(`${API_BASE}/admin/orders/veter-status-sync`, {
    method: "POST",
    headers: getAdminHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw await parseOrderError(
      res,
      `Veter status sync API error: ${res.status}`,
    );
  }

  return res.json();
}

export type LegacySyncResultData = {
  customers: {
    after_customer_id: number;
    fetched: number;
    skipped: number;
    matched: number;
    created: number;
    failed: number;
  };
  orders: {
    after_order_id: number;
    fetched: number;
    skipped: number;
    imported: number;
    failed: number;
    city_matched: number;
    city_unmatched: number;
  };
};

export async function syncLegacyCustomersAndOrders(): Promise<{
  data: LegacySyncResultData;
  message?: string;
}> {
  const res = await fetch(`${API_BASE}/admin/orders/legacy-sync`, {
    method: "POST",
    headers: getAdminHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw await parseOrderError(res, `Legacy sync API error: ${res.status}`);
  }

  return res.json();
}

/** @deprecated Используйте deleteOrder — DELETE теперь удаляет заказ, а не отменяет. */
export async function cancelOrder(id: number): Promise<{ message?: string }> {
  return deleteOrder(id);
}

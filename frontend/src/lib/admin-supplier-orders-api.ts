import { getAuthToken } from "@/lib/auth-token";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
  throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

function getAdminHeaders() {
  const token = typeof window !== "undefined" ? getAuthToken() : "";

  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function getAdminAuthHeaders() {
  const token = typeof window !== "undefined" ? getAuthToken() : "";

  return {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type SupplierOrderDraftItem = {
  id: number;
  supplier_order_id: number;
  order_id: number | null;
  order_item_id: number | null;
  supplier_id: number;
  supplier_name: string | null;
  supplier_code: string | null;
  supplier_product_name: string | null;
  retail_price: string | null;
  purchase_price_at_order: string | null;
  current_purchase_price: string | null;
  offer_missing: boolean;
  qty: number;
  supplier_variant_offer_id: number | null;
};

export type SupplierOrderDraftResponse = {
  data: SupplierOrderDraftItem[];
  total: number;
};

export type DraftFromReservationsResult = {
  added: number;
  skipped: number;
  skipped_order_item_ids: number[];
  updated_order_ids: number[];
  draft_order_ids: number[];
};

export type SupplierOrderListItem = {
  id: number;
  number: string | null;
  status: string;
  supplier_id: number;
  supplier_name: string | null;
  ordered_at: string | null;
  items_qty: number;
  total: string;
  created_at: string | null;
};

export type SupplierOrderDetailItem = {
  id: number;
  order_id: number | null;
  order_item_id: number | null;
  supplier_code: string | null;
  supplier_product_name: string | null;
  retail_price: string | null;
  purchase_price_at_order: string | null;
  qty: number;
};

export type SupplierOrderDetail = SupplierOrderListItem & {
  items?: SupplierOrderDetailItem[];
};

export type SupplierOrdersListResponse = {
  data: SupplierOrderListItem[];
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
};

export async function createSupplierOrderDraftFromReservations(): Promise<{
  data: DraftFromReservationsResult;
  message: string;
}> {
  const res = await fetch(`${API_BASE}/admin/supplier-orders/draft-from-reservations`, {
    method: "POST",
    headers: getAdminHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Supplier orders draft API error: ${res.status}`);
  }

  return res.json();
}

export async function fetchSupplierOrderDraft(): Promise<SupplierOrderDraftResponse> {
  const res = await fetch(`${API_BASE}/admin/supplier-orders/draft`, {
    headers: getAdminHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Supplier orders draft API error: ${res.status}`);
  }

  return res.json();
}

export async function updateSupplierOrderDraftItemQty(
  id: number,
  qty: number,
): Promise<{ data: SupplierOrderDraftItem }> {
  const res = await fetch(`${API_BASE}/admin/supplier-orders/items/${id}`, {
    method: "PATCH",
    headers: getAdminHeaders(),
    body: JSON.stringify({ qty }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Supplier order item update error: ${res.status}`);
  }

  return res.json();
}

export async function addSupplierOrderDraftItem(payload: {
  supplier_product_id: number;
  qty?: number;
}): Promise<{ data: SupplierOrderDraftItem; message?: string }> {
  const res = await fetch(`${API_BASE}/admin/supplier-orders/draft/items`, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `Supplier order add item error: ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.message === "string" && body.message) {
        message = body.message;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}

export async function deleteSupplierOrderDraftItem(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/supplier-orders/items/${id}`, {
    method: "DELETE",
    headers: getAdminHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Supplier order delete item error: ${res.status}`);
  }
}

export async function confirmSupplierOrders(): Promise<{
  data: SupplierOrderDetail[];
  message: string;
}> {
  const res = await fetch(`${API_BASE}/admin/supplier-orders/confirm`, {
    method: "POST",
    headers: getAdminHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Supplier orders confirm API error: ${res.status}`);
  }

  return res.json();
}

export async function fetchSupplierOrders(params?: {
  page?: number;
  per_page?: number;
}): Promise<SupplierOrdersListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page != null && params.page > 0) {
    searchParams.set("page", String(params.page));
  }
  if (params?.per_page != null && params.per_page > 0) {
    searchParams.set("per_page", String(params.per_page));
  }
  const query = searchParams.toString();
  const res = await fetch(
    `${API_BASE}/admin/supplier-orders${query ? `?${query}` : ""}`,
    {
      headers: getAdminHeaders(),
      cache: "no-store",
    },
  );

  if (!res.ok) {
    throw new Error(`Supplier orders API error: ${res.status}`);
  }

  return res.json();
}

export async function fetchSupplierOrder(id: number): Promise<{ data: SupplierOrderDetail }> {
  const res = await fetch(`${API_BASE}/admin/supplier-orders/${id}`, {
    headers: getAdminHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Supplier order API error: ${res.status}`);
  }

  return res.json();
}

export async function exportSupplierOrderXlsx(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/supplier-orders/${id}/export-xlsx`, {
    method: "GET",
    headers: getAdminAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Supplier order export API error: ${res.status}`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(disposition);
  const filename = match?.[1]
    ? decodeURIComponent(match[1].replace(/"/g, "").trim())
    : `supplier-order-${id}.xlsx`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

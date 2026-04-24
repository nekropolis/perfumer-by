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

export type AdminBlockItem = {
  id: number;
  name: string;
  code: string;
  content?: string | null;
  is_active: boolean;
  updated_at?: string | null;
};

export type AdminBlocksResponse = {
  data: AdminBlockItem[];
  current_page: number;
  last_page: number;
  total: number;
};

export type AdminBlockDetailResponse = {
  data: AdminBlockItem;
};

export async function fetchAdminBlocks(params?: {
  search?: string;
  page?: number;
}): Promise<AdminBlocksResponse> {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  if (params?.page) searchParams.set("page", String(params.page));

  const query = searchParams.toString();
  const res = await fetch(
    `${API_BASE}/admin/blocks${query ? `?${query}` : ""}`,
    {
      headers: getAdminHeaders(),
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Blocks API error: ${res.status}`);
  }

  return res.json();
}

export async function fetchAdminBlockById(
  id: number | string,
): Promise<AdminBlockDetailResponse> {
  const res = await fetch(`${API_BASE}/admin/blocks/${id}`, {
    headers: getAdminHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Block detail API error: ${res.status}`);
  }

  return res.json();
}

export async function createAdminBlock(payload: {
  name: string;
  code: string;
  content?: string;
  is_active?: boolean;
}) {
  const res = await fetch(`${API_BASE}/admin/blocks`, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Create block API error: ${res.status}`);
  }

  return res.json();
}

export async function updateAdminBlock(
  id: number,
  payload: {
    name: string;
    code: string;
    content?: string;
    is_active?: boolean;
  },
) {
  const res = await fetch(`${API_BASE}/admin/blocks/${id}`, {
    method: "PUT",
    headers: getAdminHeaders(),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Update block API error: ${res.status}`);
  }

  return res.json();
}

export async function deleteAdminBlock(id: number) {
  const res = await fetch(`${API_BASE}/admin/blocks/${id}`, {
    method: "DELETE",
    headers: getAdminHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Delete block API error: ${res.status}`);
  }

  return res.json();
}

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

function getAdminAuthHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? getAuthToken() : "";
  if (!token) {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

export type AdminPostType = "news" | "article";

export type AdminPostItem = {
  id: number;
  slug?: string;
  is_active: boolean;
  title: string;
  type: AdminPostType;
  cover_image?: string | null;
  excerpt?: string | null;
  content?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type AdminPostsResponse = {
  data: AdminPostItem[];
  current_page: number;
  last_page: number;
  total: number;
};

export type AdminPostDetailResponse = {
  data: AdminPostItem;
};

export async function fetchAdminPosts(params?: {
  search?: string;
  type?: AdminPostType | "";
  page?: number;
}): Promise<AdminPostsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  if (params?.type) searchParams.set("type", params.type);
  if (params?.page) searchParams.set("page", String(params.page));

  const query = searchParams.toString();
  const res = await fetch(`${API_BASE}/admin/posts${query ? `?${query}` : ""}`, {
    headers: getAdminHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Posts API error: ${res.status}`);
  }

  return res.json();
}

export async function fetchAdminPostById(id: number | string): Promise<AdminPostDetailResponse> {
  const res = await fetch(`${API_BASE}/admin/posts/${id}`, {
    headers: getAdminHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Post detail API error: ${res.status}`);
  }

  return res.json();
}

export async function createAdminPost(payload: {
  is_active?: boolean;
  title: string;
  slug?: string;
  type: AdminPostType;
  cover_image?: string;
  excerpt?: string;
  content?: string;
  seo_title?: string;
  seo_description?: string;
}) {
  const res = await fetch(`${API_BASE}/admin/posts`, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Create post API error: ${res.status}`);
  }

  return res.json();
}

export async function updateAdminPost(
  id: number,
  payload: {
    is_active?: boolean;
    title: string;
    slug?: string;
    type: AdminPostType;
    cover_image?: string;
    excerpt?: string;
    content?: string;
    seo_title?: string;
    seo_description?: string;
  },
) {
  const res = await fetch(`${API_BASE}/admin/posts/${id}`, {
    method: "PUT",
    headers: getAdminHeaders(),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Update post API error: ${res.status}`);
  }

  return res.json();
}

export async function deleteAdminPost(id: number) {
  const res = await fetch(`${API_BASE}/admin/posts/${id}`, {
    method: "DELETE",
    headers: getAdminHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Delete post API error: ${res.status}`);
  }

  return res.json();
}

export async function uploadAdminPostCoverImage(file: File): Promise<{ url: string; path: string }> {
  const body = new FormData();
  body.append("image", file);

  const res = await fetch(`${API_BASE}/admin/posts/cover-image`, {
    method: "POST",
    headers: getAdminAuthHeaders(),
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Upload post cover image API error: ${res.status}`);
  }

  const payload = (await res.json()) as { data?: { url?: string; path?: string } };
  return {
    url: payload.data?.url || "",
    path: payload.data?.path || "",
  };
}

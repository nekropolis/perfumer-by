export type CmsPublicPage = {
  id: number;
  name: string;
  slug: string;
  h1?: string | null;
  content?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
};

export type CmsPublicBlock = {
  id: number;
  name: string;
  code: string;
  content?: string | null;
};

export type CmsPublicPost = {
  id: number;
  slug?: string;
  title: string;
  type: "news" | "article";
  excerpt?: string | null;
  cover_image?: string | null;
  created_at?: string | null;
};

export type CmsPublicPostDetail = CmsPublicPost & {
  content?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  updated_at?: string | null;
};

function getApiBase(): string {
  const isBrowser = typeof window !== "undefined";
  const internal =
    process.env.API_URL?.trim() || process.env.INTERNAL_API_URL?.trim();
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (isBrowser) {
    if (!pub) {
      throw new Error("NEXT_PUBLIC_API_URL is not defined");
    }
    return pub.replace(/\/$/, "");
  }

  const base = internal || pub;
  if (!base) {
    throw new Error(
      "Set API_URL or NEXT_PUBLIC_API_URL for CMS pages fetching",
    );
  }
  return base.replace(/\/$/, "");
}

export async function fetchCmsPageBySlug(
  slug: string,
): Promise<CmsPublicPage | null> {
  const base = getApiBase();
  const res = await fetch(`${base}/pages/${encodeURIComponent(slug)}`, {
    cache: "no-store",
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`CMS API error: ${res.status}`);
  }

  const data = (await res.json()) as { data?: CmsPublicPage };
  return data.data ?? null;
}

export async function fetchCmsBlockByCode(
  code: string,
): Promise<CmsPublicBlock | null> {
  const base = getApiBase();
  const res = await fetch(`${base}/blocks/${encodeURIComponent(code)}`, {
    cache: "no-store",
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`CMS block API error: ${res.status}`);
  }

  const data = (await res.json()) as { data?: CmsPublicBlock };
  return data.data ?? null;
}

export async function fetchCmsPosts(params?: {
  type?: "news" | "article";
  limit?: number;
}): Promise<CmsPublicPost[]> {
  const base = getApiBase();
  const sp = new URLSearchParams();
  if (params?.type) sp.set("type", params.type);
  if (params?.limit) sp.set("limit", String(params.limit));

  const q = sp.toString();
  const res = await fetch(`${base}/posts${q ? `?${q}` : ""}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`CMS posts API error: ${res.status}`);
  }

  const data = (await res.json()) as { data?: CmsPublicPost[] };
  return data.data ?? [];
}

export async function fetchCmsPostBySlug(
  slug: string,
  type?: "news" | "article",
): Promise<CmsPublicPostDetail | null> {
  const base = getApiBase();
  const sp = new URLSearchParams();
  if (type) {
    sp.set("type", type);
  }
  const q = sp.toString();
  const res = await fetch(`${base}/posts/${encodeURIComponent(slug)}${q ? `?${q}` : ""}`, {
    cache: "no-store",
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`CMS post API error: ${res.status}`);
  }

  const data = (await res.json()) as { data?: CmsPublicPostDetail };
  return data.data ?? null;
}

/** @deprecated Используйте fetchCmsPostBySlug — публичный URL теперь по slug. */
export async function fetchCmsPostById(
  id: number | string,
  type?: "news" | "article",
): Promise<CmsPublicPostDetail | null> {
  return fetchCmsPostBySlug(String(id), type);
}

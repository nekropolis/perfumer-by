const API_BASE = process.env.NEXT_PUBLIC_API_URL?.trim() || "";

type ProductImageLoaderParams = {
    src: string;
    width: number;
    quality?: number;
};

function getApiAssetsBaseUrl(): string {
    if (!API_BASE) {
        return "";
    }

    try {
        const url = new URL(API_BASE);
        const pathname = url.pathname.replace(/\/+$/, "");
        const basePath = pathname.endsWith("/api") ? pathname.slice(0, -4) : pathname;
        return `${url.origin}${basePath}`;
    } catch {
        return "";
    }
}

export function normalizeProductImageUrl(path: string): string {
    if (path.startsWith("http://") || path.startsWith("https://")) {
        return path;
    }

    const normalizedPath = `/${path.replace(/^\/+/, "")}`;
    if (!normalizedPath.startsWith("/storage/")) {
        return normalizedPath;
    }

    const assetsBase = getApiAssetsBaseUrl();
    return assetsBase ? `${assetsBase}${normalizedPath}` : normalizedPath;
}

export function productImageLoader({ src, width, quality }: ProductImageLoaderParams): string {
    const separator = src.includes("?") ? "&" : "?";
    return `${src}${separator}w=${width}&q=${quality ?? 75}`;
}

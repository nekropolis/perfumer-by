const API_BASE = process.env.NEXT_PUBLIC_API_URL?.trim() || "";
const MAX_IMAGE_WIDTH = 1600;
const WEBP_QUALITY = 0.86;

export type ProductImageItem = {
    id: number;
    path: string;
    alt?: string | null;
    is_main?: boolean;
    sort_order?: number;
    usage_type?: "gallery" | "catalog";
    watermark_status?: string;
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

export async function optimizeImageForSeo(file: File): Promise<File> {
    if (!file.type.startsWith("image/")) {
        return file;
    }

    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width);
    const targetWidth = Math.max(1, Math.round(bitmap.width * ratio));
    const targetHeight = Math.max(1, Math.round(bitmap.height * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) {
        bitmap.close();
        return file;
    }

    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/webp", WEBP_QUALITY);
    });

    if (!blob) {
        return file;
    }

    const safeName = file.name
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9_-]/g, "-")
        .toLowerCase();

    return new File([blob], `${safeName || "product-image"}.webp`, {
        type: "image/webp",
    });
}

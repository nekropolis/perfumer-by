/** Статусы, из которых можно отправить заказ в ветерОК. После отправки → assembled (Собран). */
export const VETER_SEND_ALLOWED_STATUSES = [
    "new",
    "confirmed",
    "processing",
    "preorder",
] as const;

export type VeterSendAllowedStatus = (typeof VETER_SEND_ALLOWED_STATUSES)[number];

export function isVeterSendAllowedStatus(status: string | null | undefined): boolean {
    return VETER_SEND_ALLOWED_STATUSES.includes(
        (status ?? "") as VeterSendAllowedStatus,
    );
}

/** Fallback, если API не отдал status_label / справочник ещё не загружен. */
const FALLBACK_LABELS: Record<string, string> = {
    new: "Новый",
    confirmed: "Подтверждён",
    processing: "В обработке",
    assembled: "Собран",
    in_delivery: "В доставке",
    preorder: "Предзаказ",
    done: "Выполнен",
    cancelled: "Отменён",
    completed: "Выполнен",
};

const FALLBACK_COLORS: Record<string, string> = {
    new: "#15803D",
    confirmed: "#1D4ED8",
    processing: "#4338CA",
    assembled: "#B45309",
    in_delivery: "#0E7490",
    preorder: "#7E22CE",
    done: "#6B7280",
    cancelled: "#DC2626",
    completed: "#6B7280",
};

export function getOrderStatusLabel(
    status: string,
    statusLabel?: string | null,
): string {
    const fromApi = statusLabel?.trim();
    if (fromApi) {
        return fromApi;
    }
    return FALLBACK_LABELS[status] || status;
}

export function getOrderStatusColor(
    status: string,
    statusColor?: string | null,
): string {
    const fromApi = statusColor?.trim();
    if (fromApi && /^#[0-9A-Fa-f]{6}$/.test(fromApi)) {
        return fromApi.toUpperCase();
    }
    return FALLBACK_COLORS[status] || "#64748B";
}

/** Tailwind badge classes for account UI when only status code is known. */
export function getOrderStatusStyle(status: string): string {
    switch (status) {
        case "new":
            return "bg-yellow-100 text-yellow-800";
        case "confirmed":
            return "bg-blue-100 text-blue-800";
        case "processing":
            return "bg-indigo-100 text-indigo-800";
        case "assembled":
            return "bg-amber-100 text-amber-800";
        case "in_delivery":
            return "bg-cyan-100 text-cyan-800";
        case "preorder":
            return "bg-purple-100 text-purple-800";
        case "done":
        case "completed":
            return "bg-green-100 text-green-800";
        case "cancelled":
            return "bg-red-100 text-red-800";
        default:
            return "bg-gray-100 text-gray-800";
    }
}

/**
 * Solid “button” pill (soft UI): saturated fill, light top gradient,
 * contrast text, colored soft shadow. Used for statuses, tags, chips.
 */
export function solidColorPillStyle(color: string): {
    backgroundColor: string;
    backgroundImage: string;
    color: string;
    boxShadow: string;
    borderWidth: number;
    borderStyle: "solid";
    borderColor: string;
} {
    const hex = /^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#64748B";
    const m = hex.match(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/);
    if (!m) {
        return {
            backgroundColor: "#64748B",
            backgroundImage: "linear-gradient(180deg, #94A3B8 0%, #64748B 100%)",
            color: "#ffffff",
            boxShadow: "0 3px 8px rgba(100, 116, 139, 0.35)",
            borderWidth: 0,
            borderStyle: "solid",
            borderColor: "transparent",
        };
    }
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const top = orderStatusSoftBg(hex, 0.22);
    return {
        backgroundColor: hex,
        backgroundImage: `linear-gradient(180deg, ${top} 0%, ${hex} 100%)`,
        color: luma > 0.62 ? "#111827" : "#ffffff",
        boxShadow: `0 3px 8px rgba(${r}, ${g}, ${b}, 0.35)`,
        borderWidth: 0,
        borderStyle: "solid",
        borderColor: "transparent",
    };
}

/** Alias for status consumers. */
export function orderStatusPillStyle(color: string) {
    return solidColorPillStyle(color);
}

/** Compact chip typography matching solid status pills. */
export const SOLID_PILL_CHIP_CLASS =
    "inline-flex max-w-full items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-tight tracking-wide";

/** Лёгкий фон: цвет, смешанный с белым. */
export function orderStatusSoftBg(color: string, mixWhite = 0.88): string {
    const hex = /^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#64748B";
    const m = hex.match(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/);
    if (!m) {
        return "#F1F5F9";
    }
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    const mix = Math.min(1, Math.max(0, mixWhite));
    const rr = Math.round(r + (255 - r) * mix);
    const gg = Math.round(g + (255 - g) * mix);
    const bb = Math.round(b + (255 - b) * mix);
    return `rgb(${rr}, ${gg}, ${bb})`;
}

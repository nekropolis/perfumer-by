export const ORDER_STATUS_STYLES: Record<string, string> = {
    new: "bg-yellow-100 text-yellow-800",
    confirmed: "bg-blue-100 text-blue-800",
    processing: "bg-indigo-100 text-indigo-800",
    preorder: "bg-purple-100 text-purple-800",
    done: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
    new: "Новый",
    confirmed: "Подтверждён",
    processing: "В обработке",
    preorder: "Предзаказ",
    done: "Выполнен",
    cancelled: "Отменён",
};

export const ORDER_STATUS_OPTIONS = [
    { value: "new", label: "Новый" },
    { value: "confirmed", label: "Подтверждён" },
    { value: "processing", label: "В обработке" },
    { value: "preorder", label: "Предзаказ" },
    { value: "done", label: "Выполнен" },
    { value: "cancelled", label: "Отменён" },
];

export function getOrderStatusStyle(status: string): string {
    return ORDER_STATUS_STYLES[status] || "bg-gray-100 text-gray-800";
}

export function getOrderStatusLabel(status: string): string {
    return ORDER_STATUS_LABELS[status] || status;
}

/** Цвет подписи статуса в списке заказов (текстовый триггер). */
export function getOrderStatusTableTextClass(status: string): string {
    switch (status) {
        case "new":
            return "text-green-700";
        case "confirmed":
        case "processing":
            return "text-blue-700";
        case "preorder":
            return "text-purple-700";
        case "cancelled":
            return "text-red-600";
        case "done":
            return "text-gray-500";
        default:
            return "text-gray-800";
    }
}

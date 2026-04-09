export const ORDER_STATUS_STYLES: Record<string, string> = {
    new: "bg-yellow-100 text-yellow-800",
    confirmed: "bg-blue-100 text-blue-800",
    processing: "bg-indigo-100 text-indigo-800",
    done: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
    new: "Новый",
    confirmed: "Подтверждён",
    processing: "В обработке",
    done: "Выполнен",
    cancelled: "Отменён",
};

export function getOrderStatusStyle(status: string): string {
    return ORDER_STATUS_STYLES[status] || "bg-gray-100 text-gray-800";
}

export function getOrderStatusLabel(status: string): string {
    return ORDER_STATUS_LABELS[status] || status;
}
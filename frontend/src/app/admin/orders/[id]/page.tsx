import { fetchOrder } from "@/lib/admin-orders-api";
import AdminOrderStatusForm from "@/components/admin/admin-order-status-form";
import AdminOrderItemsTable from "@/components/admin/admin-order-items-table";
import CopyText from "@/components/ui/copy-text";

type Props = {
    params: Promise<{ id: string }>;
};

export default async function AdminOrderPage({ params }: Props) {
    const { id } = await params;
    const response = await fetchOrder(Number(id));
    const order = response.data;

    return (
        <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
            <div className="mb-8 flex items-center gap-2">
                <h1 className="text-3xl font-semibold">Заказ</h1>
                <CopyText
                    value={String(order.id)}
                    label={`#${order.id}`}
                    title="Скопировать номер заказа"
                    iconSize={16}
                    className="text-2xl font-semibold text-gray-700"
                />
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
                <div className="rounded-2xl border p-5">
                    <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <div className="text-sm text-gray-500">Имя</div>
                            <div>{order.customer_name || "—"}</div>
                        </div>

                        <div>
                            <div className="text-sm text-gray-500">Телефон</div>
                            <div>{order.phone}</div>
                        </div>

                        <div>
                            <div className="text-sm text-gray-500">Статус</div>
                            <div>{order.status}</div>
                        </div>

                        <div>
                            <div className="text-sm text-gray-500">Товаров</div>
                            <div>{order.items_qty}</div>
                        </div>
                    </div>

                    {order.comment && (
                        <div className="mb-6">
                            <div className="text-sm text-gray-500 mb-1">Комментарий</div>
                            <div>{order.comment}</div>
                        </div>
                    )}

                    <AdminOrderItemsTable items={order.items} />
                </div>

                <aside className="rounded-2xl border p-5">
                    <div className="mb-4 text-lg font-medium">Итого</div>
                    <div className="mb-6 text-2xl font-semibold">{order.total} руб.</div>

                    <AdminOrderStatusForm orderId={order.id} currentStatus={order.status} />
                </aside>
            </div>
        </main>
    );
}
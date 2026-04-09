import Link from "next/link";
import { fetchOrders } from "@/lib/admin-orders-api";

export default async function AdminOrdersPage() {
    const response = await fetchOrders();
    const orders = response.data;

    return (
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <div className="mb-8">
                <h1 className="text-3xl font-semibold">Заказы</h1>
                <p className="mt-2 text-gray-600">
                    Всего заказов: {response.meta.total}
                </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left">
                    <tr>
                        <th className="px-4 py-3">ID</th>
                        <th className="px-4 py-3">Имя</th>
                        <th className="px-4 py-3">Телефон</th>
                        <th className="px-4 py-3">Статус</th>
                        <th className="px-4 py-3">Товаров</th>
                        <th className="px-4 py-3">Сумма</th>
                        <th className="px-4 py-3">Действия</th>
                    </tr>
                    </thead>

                    <tbody>
                    {orders.map((order) => (
                        <tr key={order.id} className="border-t">
                            <td className="px-4 py-3">#{order.id}</td>
                            <td className="px-4 py-3">{order.customer_name || "—"}</td>
                            <td className="px-4 py-3">{order.phone}</td>
                            <td className="px-4 py-3">{order.status}</td>
                            <td className="px-4 py-3">{order.items_qty}</td>
                            <td className="px-4 py-3">{order.total} руб.</td>
                            <td className="px-4 py-3">
                                <Link
                                    href={`/admin/orders/${order.id}`}
                                    className="underline"
                                >
                                    Открыть
                                </Link>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </main>
    );
}
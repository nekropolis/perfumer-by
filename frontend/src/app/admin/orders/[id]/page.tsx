import Link from "next/link";
import { fetchOrder } from "@/lib/admin-orders-api";
import { giftCertificateStatusLabel } from "@/lib/admin-loyalty-api";
import { getOrderStatusLabel } from "@/constants/order-statuses";
import AdminOrderStatusForm from "@/components/admin/admin-order-status-form";
import AdminOrderInventorySync from "@/components/admin/admin-order-inventory-sync";
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
                            <div>{getOrderStatusLabel(order.status)}</div>
                        </div>

                        <div>
                            <div className="text-sm text-gray-500">Товаров</div>
                            <div>{order.items_qty}</div>
                        </div>

                        <div>
                            <div className="text-sm text-gray-500">Способ доставки</div>
                            <div>{order.delivery_method_label || order.delivery_method || "—"}</div>
                        </div>

                        <div>
                            <div className="text-sm text-gray-500">Населённый пункт</div>
                            <div>{order.delivery_city || "—"}</div>
                        </div>

                        <div className="md:col-span-2">
                            <div className="text-sm text-gray-500">Адрес доставки</div>
                            <div className="whitespace-pre-wrap">{order.delivery_address || "—"}</div>
                        </div>

                        <div>
                            <div className="text-sm text-gray-500">Стоимость доставки</div>
                            <div>
                                {parseFloat(order.delivery_fee ?? "0") === 0
                                    ? "Бесплатно"
                                    : `${order.delivery_fee} руб.`}
                            </div>
                        </div>

                        <div>
                            <div className="text-sm text-gray-500">Способ оплаты</div>
                            <div>{order.payment_method_label || order.payment_method || "—"}</div>
                        </div>

                        <div>
                            <div className="text-sm text-gray-500">Скидочная карта</div>
                            <div>{order.discount_card_number || "—"}</div>
                        </div>

                        <div>
                            <div className="text-sm text-gray-500">% скидки</div>
                            <div>{order.discount_percent_snapshot ?? "0.00"}%</div>
                        </div>

                        <div>
                            <div className="text-sm text-gray-500">Сумма скидки</div>
                            <div>{order.discount_amount ?? "0.00"} руб.</div>
                        </div>

                        <div>
                            <div className="text-sm text-gray-500">Оплата сертификатом</div>
                            <div>{order.gift_certificate_code || order.gift_certificate_number || "—"}</div>
                        </div>

                        <div>
                            <div className="text-sm text-gray-500">Списание сертификата</div>
                            <div>{order.gift_certificate_amount ?? "0.00"} руб.</div>
                        </div>

                        {order.gift_certificate_purchases && order.gift_certificate_purchases.length > 0 ? (
                            <div className="md:col-span-2">
                                <div className="text-sm text-gray-500">Купленные сертификаты</div>
                                <ul className="mt-1 space-y-1 text-sm">
                                    {order.gift_certificate_purchases.map((row) => (
                                        <li key={row.id} className="rounded-lg border border-violet-100 bg-violet-50/50 px-3 py-2">
                                            <span className="font-medium">{row.template_title}</span>
                                            <span className="text-gray-600">
                                                {" "}
                                                — {row.amount} руб. × {row.qty} = {row.total} руб.
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}

                        {order.sold_gift_certificates && order.sold_gift_certificates.length > 0 ? (
                            <div className="md:col-span-2">
                                <div className="text-sm text-gray-500">Выпущенные сертификаты (каталог)</div>
                                <ul className="mt-1 space-y-2 text-sm">
                                    {order.sold_gift_certificates.map((row) => (
                                        <li
                                            key={row.id}
                                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2"
                                        >
                                            <div>
                                                <div className="font-mono text-xs text-gray-500">ID {row.id}</div>
                                                <div className="font-medium">{row.template_title ?? "Сертификат"}</div>
                                                <div className="text-gray-600">
                                                    {row.initial_amount} руб. · {giftCertificateStatusLabel(row.status, row.code)}
                                                    {row.code ? ` · ${row.code}` : ""}
                                                </div>
                                            </div>
                                            <Link
                                                href={`/admin/loyalty/certificates/${row.id}/edit`}
                                                className="shrink-0 rounded-lg border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
                                            >
                                                Код
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </div>

                    {order.comment && (
                        <div className="mb-6">
                            <div className="text-sm text-gray-500 mb-1">Комментарий</div>
                            <div>{order.comment}</div>
                        </div>
                    )}

                    <AdminOrderItemsTable
                        items={order.items}
                        certificatePurchases={order.gift_certificate_purchases}
                    />
                </div>

                <aside className="rounded-2xl border p-5">
                    <div className="mb-4 text-lg font-medium">Итого к оплате</div>
                    <div className="mb-2 space-y-1 text-sm text-gray-600">
                        <div className="flex justify-between gap-2">
                            <span>Сумма товаров</span>
                            <span className="shrink-0">{order.subtotal} руб.</span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span>Скидка по скидочной карте</span>
                            <span className="shrink-0">−{order.discount_amount ?? "0.00"} руб.</span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span>Списание сертификата</span>
                            <span className="shrink-0">−{order.gift_certificate_amount ?? "0.00"} руб.</span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span>Доставка</span>
                            <span className="shrink-0">
                                {parseFloat(order.delivery_fee ?? "0") === 0 ? "бесплатно" : `${order.delivery_fee} руб.`}
                            </span>
                        </div>
                    </div>
                    <div className="mb-6 text-2xl font-semibold">{order.total} руб.</div>

                    <AdminOrderStatusForm orderId={order.id} currentStatus={order.status} />
                    <AdminOrderInventorySync
                        orderId={order.id}
                        canSync={Boolean(order.can_sync_inventory_writeoff)}
                    />
                </aside>
            </div>
        </main>
    );
}
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminOrderForm from "@/components/admin/orders/order-form";
import { fetchOrder, updateOrder } from "@/lib/admin-orders-api";
import type { OrderData } from "@/types/orders";

export default function AdminOrderEditPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetchOrder(Number(params.id));
        setOrder(response.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось загрузить заказ");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [params.id]);

  return (
    <AdminPageCard>
      <Breadcrumbs
        className="mb-4"
        items={[
          { label: "Админка", href: "/admin" },
          { label: "Заказы", href: "/admin/orders" },
          { label: "Редактирование" },
        ]}
      />

      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Редактировать заказ</h1>
          <p className="mt-1 text-sm text-gray-600">Изменение заказа #{params.id}</p>
        </div>
        <Link href="/admin/orders" className="rounded-xl border px-4 py-2 text-sm">
          Назад
        </Link>
      </div>

      {error ? (
        <div className="mb-4">
          <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
        </div>
      ) : null}

      {loading ? (
        <AdminLoadingState text="Загрузка заказа..." />
      ) : order ? (
        <AdminOrderForm mode="edit" order={order} onSubmitAction={(payload) => updateOrder(order.id, payload)} />
      ) : null}
    </AdminPageCard>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AdminCrudHeader from "@/components/admin/ui/admin-crud-header";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminOrderCreateForm from "@/components/admin/orders/admin-order-create-form";
import { fetchOrder } from "@/lib/admin-orders-api";
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
      <AdminCrudHeader
        backHref="/admin/orders"
        backAriaLabel="Назад к заказам"
        title={`Редактировать заказ #${params.id}`}
        items={[
          { label: "Админка", href: "/admin" },
          { label: "Заказы", href: "/admin/orders" },
          { label: "Редактирование" },
        ]}
      />

      {error ? (
        <div className="mb-4">
          <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} />
        </div>
      ) : null}

      {loading ? (
        <AdminLoadingState text="Загрузка заказа..." />
      ) : order ? (
        <AdminOrderCreateForm mode="edit" initialOrder={order} />
      ) : null}
    </AdminPageCard>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminOrderCreateForm from "@/components/admin/orders/admin-order-create-form";
import { fetchOrder } from "@/lib/admin-orders-api";
import type { OrderData } from "@/types/orders";

export default function AdminOrderCreatePage() {
  const searchParams = useSearchParams();
  const phoneFromQuery = searchParams.get("phone") ?? "";
  const nameFromQuery = searchParams.get("name") ?? "";
  const fromIdRaw = searchParams.get("from");
  const fromId = fromIdRaw ? Number(fromIdRaw) : NaN;
  const copyFromId = Number.isFinite(fromId) && fromId > 0 ? fromId : null;

  const [copyFromOrder, setCopyFromOrder] = useState<OrderData | null>(null);
  const [copyLoading, setCopyLoading] = useState(Boolean(copyFromId));
  const [copyError, setCopyError] = useState("");

  useEffect(() => {
    if (!copyFromId) {
      setCopyFromOrder(null);
      setCopyLoading(false);
      setCopyError("");
      return;
    }
    let cancelled = false;
    setCopyLoading(true);
    setCopyError("");
    void fetchOrder(copyFromId)
      .then((response) => {
        if (!cancelled) setCopyFromOrder(response.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setCopyFromOrder(null);
          setCopyError(err instanceof Error ? err.message : "Не удалось загрузить заказ для копии");
        }
      })
      .finally(() => {
        if (!cancelled) setCopyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [copyFromId]);

  return (
    <AdminPageCard>
      <Breadcrumbs
        className="mb-4"
        items={[
          { label: "Админка", href: "/admin" },
          { label: "Заказы", href: "/admin/orders" },
          { label: copyFromId ? "Копия" : "Создание" },
        ]}
      />

      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {copyFromId ? `Копия заказа #${copyFromId}` : "Создать заказ"}
          </h1>
        </div>
        <Link href="/admin/orders" className="rounded-lg border px-4 py-2 text-sm">
          Назад
        </Link>
      </div>

      {copyError ? (
        <div className="mb-4">
          <AdminFeedbackMessage type="error" message={copyError} onCloseAction={() => setCopyError("")} />
        </div>
      ) : null}

      {copyLoading ? (
        <AdminLoadingState text="Загрузка заказа для копии..." />
      ) : copyFromId && !copyFromOrder ? null : (
        <AdminOrderCreateForm
          initialPhone={phoneFromQuery}
          initialCustomerName={nameFromQuery}
          copyFromOrder={copyFromOrder ?? undefined}
        />
      )}
    </AdminPageCard>
  );
}

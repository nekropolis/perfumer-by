"use client";

import Link from "next/link";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminOrderForm from "@/components/admin/orders/order-form";
import { createOrder } from "@/lib/admin-orders-api";

export default function AdminOrderCreatePage() {
  return (
    <AdminPageCard>
      <Breadcrumbs
        className="mb-4"
        items={[
          { label: "Админка", href: "/admin" },
          { label: "Заказы", href: "/admin/orders" },
          { label: "Создание" },
        ]}
      />

      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Создать заказ</h1>
          <p className="mt-1 text-sm text-gray-600">Новый заказ вручную из админки</p>
        </div>
        <Link href="/admin/orders" className="rounded-xl border px-4 py-2 text-sm">
          Назад
        </Link>
      </div>

      <AdminOrderForm mode="create" onSubmitAction={createOrder} />
    </AdminPageCard>
  );
}

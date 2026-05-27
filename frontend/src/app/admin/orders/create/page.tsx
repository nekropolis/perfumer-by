"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminOrderCreateForm from "@/components/admin/orders/admin-order-create-form";

export default function AdminOrderCreatePage() {
  const searchParams = useSearchParams();
  const phoneFromQuery = searchParams.get("phone") ?? "";
  const nameFromQuery = searchParams.get("name") ?? "";

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
        </div>
        <Link href="/admin/orders" className="rounded-xl border px-4 py-2 text-sm">
          Назад
        </Link>
      </div>

      <AdminOrderCreateForm initialPhone={phoneFromQuery} initialCustomerName={nameFromQuery} />
    </AdminPageCard>
  );
}

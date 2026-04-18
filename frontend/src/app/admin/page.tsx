"use client";

import Link from "next/link";
import AdminGuard from "@/components/admin/admin-guard";

export default function AdminPage() {
    return (
        <AdminGuard>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                <Link
                    href="/admin/orders"
                    className="rounded-2xl border p-5 transition hover:shadow-sm"
                >
                    <div className="mb-2 text-lg font-medium">Заказы</div>
                    <div className="text-sm text-gray-600">
                        Просмотр и обработка всех заказов магазина
                    </div>
                </Link>

                <div className="rounded-2xl border p-5">
                    <div className="mb-2 text-lg font-medium">Каталог</div>
                    <div className="text-sm text-gray-600">
                        Бренды, товары, категории и варианты
                    </div>
                </div>

                <div className="rounded-2xl border p-5">
                    <div className="mb-2 text-lg font-medium">Контент</div>
                    <div className="text-sm text-gray-600">
                        Страницы, футер и информационные блоки
                    </div>
                </div>
            </div>

            <div className="mt-8 rounded-2xl border border-dashed p-6 text-gray-600">
                Здесь позже добавим графики, KPI, последние заказы и сводную информацию.
            </div>

        </AdminGuard>
    );
}
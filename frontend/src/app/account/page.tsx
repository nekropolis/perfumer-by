"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import UserAccount from "@/components/account/user-account";
import OrdersAccount from "@/components/account/orders-account";

export default function AccountPage() {
    const { user, isAuthenticated, loading, logout } = useAuth();

    if (loading) {
        return (
            <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
                Загрузка...
            </main>
        );
    }

    if (!isAuthenticated) {
        return (
            <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
                <h1 className="mb-6 text-3xl font-semibold">Аккаунт</h1>
                <p className="mb-6 text-gray-600">Вы не авторизованы.</p>
                <Link href="/login" className="inline-block rounded-xl border px-4 py-2">
                    Войти
                </Link>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <h1 className="mb-8 text-3xl font-semibold">Личный кабинет</h1>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
                <UserAccount user={user} logoutAction={logout} />
                <OrdersAccount isAuthenticated={isAuthenticated} />
            </div>
        </main>
    );
}
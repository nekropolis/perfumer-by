"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import UserAccount from "@/components/account/user-account";
import OrdersAccount from "@/components/account/orders-account";
import {useRouter} from "next/navigation";
import {useEffect} from "react";
import {isPrivilegedRole} from "@/constants/admin-roles";

export default function AccountPage() {
    const { user, isAuthenticated, loading, logout, refreshUser } = useAuth();

    const router = useRouter();

    useEffect(() => {
        if (!loading && isAuthenticated && isPrivilegedRole(user?.role)) {
            router.replace("/admin");
        }
    }, [loading, isAuthenticated, user?.role, router]);

    useEffect(() => {
        if (!isAuthenticated) {
            return;
        }

        const refreshSafely = () => {
            if (document.visibilityState === "visible") {
                void refreshUser();
            }
        };

        const intervalId = window.setInterval(() => {
            void refreshUser();
        }, 20000);

        window.addEventListener("focus", refreshSafely);
        document.addEventListener("visibilitychange", refreshSafely);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener("focus", refreshSafely);
            document.removeEventListener("visibilitychange", refreshSafely);
        };
    }, [isAuthenticated, refreshUser]);

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
        <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
                <div className="mb-8">
                    <div className="text-sm font-medium uppercase tracking-[0.24em] text-[var(--text-secondary)]">
                        Личный кабинет
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
                    <UserAccount user={user} logoutAction={logout} />
                    <OrdersAccount isAuthenticated={isAuthenticated} />
                </div>
            </div>
        </main>
    );
}
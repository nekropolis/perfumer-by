"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { isAdminRole } from "@/constants/admin-roles";

type Props = {
    children: React.ReactNode;
};

export default function AdminGuard({ children }: Props) {
    const router = useRouter();
    const { user, isAuthenticated, loading } = useAuth();

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.replace("/login");
        }
    }, [loading, isAuthenticated, router]);

    if (loading) {
        return (
            <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
                Загрузка...
            </main>
        );
    }

    if (!isAuthenticated) {
        return (
            <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
                Перенаправление...
            </main>
        );
    }

    if (!isAdminRole(user?.role)) {
        return (
            <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
                <h1 className="mb-6 text-3xl font-semibold">Недостаточно прав</h1>
                <p className="mb-6 text-gray-600">
                    У вас нет доступа к панели администратора.
                </p>

                <div className="flex gap-3">
                    <Link href="/" className="rounded-xl border px-4 py-2">
                        На главную
                    </Link>

                    <Link href="/account" className="rounded-xl bg-black px-4 py-2 text-white">
                        В аккаунт
                    </Link>
                </div>
            </main>
        );
    }

    return <>{children}</>;
}
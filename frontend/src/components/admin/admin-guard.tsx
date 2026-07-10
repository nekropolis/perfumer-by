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
            <div className="flex min-h-[40vh] items-center justify-center text-admin-text-secondary">
                Загрузка...
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center text-admin-text-secondary">
                Перенаправление...
            </div>
        );
    }

    if (!isAdminRole(user)) {
        return (
            <div className="mx-auto max-w-lg rounded-xl border border-admin-border bg-admin-surface p-6 shadow-admin-card">
                <h1 className="mb-4 text-xl font-semibold text-admin-text">Недостаточно прав</h1>
                <p className="mb-6 text-admin-text-secondary">
                    У вас нет доступа к панели администратора.
                </p>

                <div className="flex gap-3">
                    <Link href="/" className="rounded-xl border px-4 py-2">
                        На главную
                    </Link>

                    <Link href="/account" className="rounded-full bg-admin-primary px-4 py-2 text-white">
                        В аккаунт
                    </Link>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
"use client";

import { useAuth } from "@/components/auth/auth-provider";
import AccountGuestView from "@/components/account/account-guest-view";
import UserAccount from "@/components/account/user-account";
import OrdersAccount from "@/components/account/orders-account";
import {useRouter} from "next/navigation";
import {useCallback, useEffect, useState} from "react";
import {isPrivilegedRole} from "@/constants/admin-roles";

export default function AccountPage() {
    const { user, isAuthenticated, loading, logout, refreshUser } = useAuth();

    const router = useRouter();
    const [isProfileEditing, setIsProfileEditing] = useState(false);
    const [profileSaveNotice, setProfileSaveNotice] = useState("");

    const handleProfileSaved = useCallback(() => {
        setIsProfileEditing(false);
        setProfileSaveNotice("Данные сохранены");
        void refreshUser();
    }, [refreshUser]);

    const handleProfileCancel = useCallback(() => {
        setIsProfileEditing(false);
    }, []);

    const handleProfileEdit = useCallback(() => {
        setProfileSaveNotice("");
        setIsProfileEditing(true);
    }, []);

    useEffect(() => {
        if (!profileSaveNotice) {
            return;
        }

        const timeoutId = window.setTimeout(() => setProfileSaveNotice(""), 5000);

        return () => window.clearTimeout(timeoutId);
    }, [profileSaveNotice]);

    useEffect(() => {
        if (!loading && isAuthenticated && isPrivilegedRole(user)) {
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
            <main className="flex min-h-[50vh] items-center justify-center bg-admin-bg px-4">
                <p className="text-sm text-admin-text-secondary">Загрузка…</p>
            </main>
        );
    }

    if (!isAuthenticated) {
        return <AccountGuestView />;
    }

    return (
        <main className="min-h-screen bg-admin-bg text-admin-text">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
                <div className="mb-8">
                    <div className="text-sm font-medium uppercase tracking-[0.12em] text-admin-text-secondary">
                        Личный кабинет
                    </div>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Профиль и заказы</h1>
                </div>

                <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
                    <UserAccount
                        user={user}
                        logoutAction={logout}
                        onEditAction={handleProfileEdit}
                    />
                    <OrdersAccount
                        isAuthenticated={isAuthenticated}
                        isProfileEditing={isProfileEditing}
                        user={user}
                        profileSaveNotice={profileSaveNotice}
                        onProfileSavedAction={handleProfileSaved}
                        onProfileCancelAction={handleProfileCancel}
                    />
                </div>
            </div>
        </main>
    );
}
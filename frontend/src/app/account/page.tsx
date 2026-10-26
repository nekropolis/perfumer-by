"use client";

import { useAuth } from "@/components/auth/auth-provider";
import AccountGuestView from "@/components/account/account-guest-view";
import AccountProfileEditModal from "@/components/account/account-profile-edit-modal";
import UserAccount from "@/components/account/user-account";
import OrdersAccount from "@/components/account/orders-account";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { isPrivilegedRole } from "@/constants/admin-roles";

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
    }, [loading, isAuthenticated, user?.actor_type, user?.role, router]);

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
        <main className="bg-admin-bg text-admin-text md:min-h-screen">
            <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 md:py-8 lg:px-8 lg:py-12">
                <div className="mb-6 hidden items-center gap-4 md:flex">
                    <div className="shrink-0 text-sm font-medium uppercase tracking-[0.12em] text-admin-text-secondary">
                        Личный кабинет
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Профиль и заказы</h1>
                </div>

                <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-6">
                    <UserAccount
                        user={user}
                        logoutAction={logout}
                        onEditAction={handleProfileEdit}
                    />
                    <OrdersAccount
                        isAuthenticated={isAuthenticated}
                        profileSaveNotice={profileSaveNotice}
                    />
                </div>

                {isProfileEditing && user ? (
                    <AccountProfileEditModal
                        user={user}
                        onCloseAction={handleProfileCancel}
                        onSavedAction={handleProfileSaved}
                    />
                ) : null}
            </div>
        </main>
    );
}
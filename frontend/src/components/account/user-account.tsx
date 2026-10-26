"use client";

import { ChevronRight, LogOut, Pencil } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/components/auth/auth-provider";
import AccountMobileProfile from "@/components/account/account-mobile-profile";
import AttachLoyaltyCardModal from "@/components/account/attach-loyalty-card-modal";
import { resolveActiveLoyaltyCard } from "@/lib/loyalty-pricing";
import { formatBelarusPhoneSpaced } from "@/lib/site-contact";
import type { AuthUserProfile } from "@/lib/auth-api";
import { siteBtnPrimary, siteBtnSecondary, siteCard } from "@/lib/site-ui-classes";

type UserAccountProps = {
    user: AuthUserProfile | null;
    logoutAction: () => void;
    onEditAction?: () => void;
};

function formatBirthDate(value?: string | null): string | null {
    if (!value) {
        return null;
    }
    const [year, month, day] = value.split("-");
    if (!year || !month || !day) {
        return value;
    }
    return `${day}.${month}.${year}`;
}

function formatProfileName(user: AuthUserProfile | null): string {
    const fromParts = [user?.first_name, user?.patronymic, user?.last_name]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" ");

    if (fromParts) {
        return fromParts;
    }

    return user?.name?.trim() || "Гость";
}

function formatDiscountPercent(value: string) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return value;
    }
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

export default function UserAccount({ user, logoutAction, onEditAction }: UserAccountProps) {
    const { refreshUser } = useAuth();
    const [attachModalOpen, setAttachModalOpen] = useState(false);
    const [mobileProfileOpen, setMobileProfileOpen] = useState(false);

    const activeCard = resolveActiveLoyaltyCard(user?.discount_cards);
    const displayName = formatProfileName(user);
    const userInitial = displayName.trim()?.[0]?.toUpperCase() || "U";
    const birthDateLabel = formatBirthDate(user?.birth_date);
    const statusLabel = activeCard ? "Постоянный клиент" : "Новый клиент";

    return (
        <>
        <aside className="contents lg:col-start-1 lg:row-span-2 lg:grid lg:grid-rows-subgrid">
            <section className={`${siteCard} px-3 py-2.5 md:p-5 lg:h-full`}>
                <button
                    type="button"
                    onClick={() => setMobileProfileOpen(true)}
                    className="flex w-full items-center gap-2.5 text-left md:hidden"
                >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-admin-primary text-base font-semibold text-white">
                        {userInitial}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-semibold leading-tight text-admin-text">{displayName}</div>
                        <div className="mt-0.5 truncate text-xs leading-tight text-admin-text-secondary">
                            {user?.phone ? formatBelarusPhoneSpaced(user.phone) : "Телефон не указан"}
                        </div>
                        <div className="mt-1">
                            <span className="inline-flex items-center rounded-full bg-admin-muted px-2 py-px text-[11px] font-medium leading-4 text-admin-text">
                                {statusLabel}
                            </span>
                        </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-admin-text-muted" aria-hidden />
                </button>

                <div className="hidden items-center gap-4 md:flex">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-admin-primary text-lg font-semibold text-white">
                        {userInitial}
                    </div>

                    <div className="min-w-0">
                        <div className="truncate text-lg font-semibold text-admin-text">
                            {displayName}
                        </div>

                        <div className="mt-2 text-xs text-admin-text-secondary">
                            {user?.phone ? formatBelarusPhoneSpaced(user.phone) : "Телефон не указан"}
                        </div>
                        <div className="mt-1.5">
                            <span className="inline-flex items-center rounded-full bg-admin-muted px-2 py-0.5 text-xs font-medium text-admin-text">
                                {statusLabel}
                            </span>
                        </div>

                        {user?.email ? (
                            <div className="mt-1 truncate text-sm text-admin-text-secondary">{user.email}</div>
                        ) : null}

                        {birthDateLabel ? (
                            <div className="mt-2 text-sm text-admin-text-secondary">
                                Дата рождения: {birthDateLabel}
                            </div>
                        ) : null}

                        {onEditAction ? (
                            <button
                                type="button"
                                onClick={onEditAction}
                                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-admin-primary transition hover:text-admin-primary-hover"
                            >
                                <Pencil className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                                Редактировать
                            </button>
                        ) : null}
                    </div>
                </div>

            </section>

            <div className="contents lg:flex lg:flex-col lg:gap-4 lg:self-start">
            <section className="rounded-2xl border border-admin-primary bg-admin-primary px-4 py-3 text-white">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/70">
                            Карта лояльности
                        </div>
                        {activeCard ? (
                            <div className="mt-1 truncate font-mono text-base font-semibold tracking-wide">
                                {activeCard.number}
                            </div>
                        ) : (
                            <div className="mt-1 text-sm font-medium">Карта не привязана</div>
                        )}
                    </div>

                    {activeCard ? (
                        <div className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-sm font-semibold text-admin-primary">
                            {formatDiscountPercent(String(activeCard.discountPercent))}%
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setAttachModalOpen(true)}
                            className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-medium text-admin-primary"
                        >
                            Добавить
                        </button>
                    )}
                </div>
                {activeCard ? (
                    <p className="mt-2 text-xs leading-snug text-white/75">
                        Заменить карту может только менеджер магазина.
                    </p>
                ) : null}
            </section>

            <section className="order-last lg:order-none">
                <button
                    type="button"
                    onClick={logoutAction}
                    className={`${siteCard} flex w-full items-center gap-2 px-4 py-3.5 text-left md:hidden`}
                >
                    <LogOut className="h-5 w-5 shrink-0 text-admin-text" aria-hidden />
                    <span className="min-w-0 flex-1 text-base font-semibold text-admin-text">Выйти</span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-admin-text-muted" aria-hidden />
                </button>
                <div className={`${siteCard} hidden p-2 md:block`}>
                    <button
                        type="button"
                        onClick={logoutAction}
                        className={`${siteBtnSecondary} w-full justify-between`}
                    >
                        Выйти
                        <span aria-hidden>→</span>
                    </button>
                </div>
            </section>
            </div>
        </aside>

        {attachModalOpen
            ? createPortal(
                  <AttachLoyaltyCardModal
                      onCloseAction={() => setAttachModalOpen(false)}
                      onSuccessAction={() => void refreshUser()}
                  />,
                  document.body,
              )
            : null}

        {mobileProfileOpen && user ? (
            <AccountMobileProfile
                user={user}
                onCloseAction={() => setMobileProfileOpen(false)}
                onSavedAction={() => void refreshUser()}
            />
        ) : null}
        </>
    );
}

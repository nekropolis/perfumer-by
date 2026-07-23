"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
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

    const activeCard = resolveActiveLoyaltyCard(user?.discount_cards);
    const displayName = formatProfileName(user);
    const userInitial = displayName.trim()?.[0]?.toUpperCase() || "U";
    const birthDateLabel = formatBirthDate(user?.birth_date);

    return (
        <aside className="space-y-4">
            <section className={`${siteCard} p-5`}>
                <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-admin-primary text-lg font-semibold text-white">
                        {userInitial}
                    </div>

                    <div className="min-w-0">
                        <div className="truncate text-lg font-semibold text-admin-text">
                            {displayName}
                        </div>

                        <div className="mt-1 text-sm text-admin-text-secondary">
                            {user?.phone ? formatBelarusPhoneSpaced(user.phone) : "Телефон не указан"}
                        </div>

                        {user?.email ? (
                            <div className="mt-1 truncate text-sm text-admin-text-secondary">{user.email}</div>
                        ) : null}

                        {birthDateLabel ? (
                            <div className="mt-1 text-sm text-admin-text-secondary">
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

                <div className="mt-4 rounded-lg bg-admin-muted px-4 py-3">
                    <div className="text-xs font-medium uppercase tracking-[0.12em] text-admin-text-secondary">
                        Статус
                    </div>
                    <div className="mt-1 text-sm font-medium text-admin-text">
                        {activeCard ? "Постоянный клиент" : "Новый клиент"}
                    </div>
                </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-admin-primary bg-admin-primary p-5 text-white shadow-sm">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-xs font-medium uppercase tracking-[0.12em] text-white/70">
                            Карта лояльности
                        </div>

                        {activeCard ? (
                            <>
                                <div className="mt-4 font-mono text-lg font-semibold tracking-wide">
                                    {activeCard.number}
                                </div>
                                <div className="mt-1 text-sm text-white/75">Накопительная скидка</div>
                            </>
                        ) : (
                            <>
                                <div className="mt-4 text-lg font-semibold">Карта не привязана</div>
                                <div className="mt-1 text-sm text-white/75">Добавьте карту и получайте скидки.</div>
                            </>
                        )}
                    </div>

                    {activeCard ? (
                        <div className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-admin-primary">
                            {formatDiscountPercent(String(activeCard.discountPercent))}%
                        </div>
                    ) : null}
                </div>

                {activeCard ? (
                    <div className="mt-4 rounded-2xl border border-white/15 bg-black/10 px-3 py-2.5 text-sm leading-snug text-white/90">
                        Карта привязана к профилю. Отвязать или заменить её может только менеджер магазина.
                    </div>
                ) : null}

                {!activeCard ? (
                    <button
                        type="button"
                        onClick={() => setAttachModalOpen(true)}
                        className={`${siteBtnSecondary} mt-4 w-full border-white/20 bg-white text-admin-primary hover:bg-admin-muted`}
                    >
                        Добавить карту
                    </button>
                ) : null}
            </section>

            <section className={`${siteCard} p-2`}>
                <button
                    type="button"
                    onClick={logoutAction}
                    className={`${siteBtnSecondary} w-full justify-between`}
                >
                    Выйти
                    <span aria-hidden>→</span>
                </button>
            </section>

            {attachModalOpen ? (
                <AttachLoyaltyCardModal
                    onCloseAction={() => setAttachModalOpen(false)}
                    onSuccessAction={() => void refreshUser()}
                />
            ) : null}
        </aside>
    );
}

"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import AttachLoyaltyCardModal from "@/components/account/attach-loyalty-card-modal";
import { resolveActiveLoyaltyCard } from "@/lib/loyalty-pricing";
import { formatBelarusPhoneSpaced } from "@/lib/site-contact";

type UserAccountProps = {
    user: {
        name?: string | null;
        phone?: string | null;
        discount_cards?: {
            id: number;
            number: string;
            discount_percent: string;
            is_active: boolean;
        }[];
    } | null;
    logoutAction: () => void;
    onEditAction?: () => void;
};

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
    const userInitial = user?.name?.trim()?.[0]?.toUpperCase() || "U";

    return (
        <aside className="space-y-5">
            <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_24px_70px_rgba(31,23,34,0.06)]">
                <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)] text-xl font-semibold text-white shadow-lg">
                        {userInitial}
                    </div>

                    <div className="min-w-0">
                        <div className="truncate text-lg font-semibold text-[var(--foreground)]">
                            {user?.name || "Гость"}
                        </div>

                        <div className="mt-1 text-sm text-[var(--text-secondary)]">
                            {user?.phone ? formatBelarusPhoneSpaced(user.phone) : "Телефон не указан"}
                        </div>

                        {onEditAction ? (
                            <button
                                type="button"
                                onClick={onEditAction}
                                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] underline decoration-[var(--accent)] underline-offset-[3px] transition hover:opacity-80"
                            >
                                <Pencil className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                                Редактировать
                            </button>
                        ) : null}
                    </div>
                </div>

                <div className="mt-5 rounded-2xl bg-[var(--background)] px-4 py-3">
                    <div className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                        Статус
                    </div>

                    <div className="mt-1 text-sm font-medium text-[var(--foreground)]">
                        {activeCard ? "Постоянный клиент" : "Новый клиент"}
                    </div>
                </div>
            </section>

            <section className="overflow-hidden rounded-[2rem] bg-[var(--accent)] p-5 text-white shadow-[0_24px_70px_rgba(111,74,126,0.22)]">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-xs font-medium uppercase tracking-[0.24em] text-white/60">
                            Карта лояльности
                        </div>

                        {activeCard ? (
                            <>
                                <div className="mt-7 font-mono text-xl font-semibold tracking-wide">
                                    {activeCard.number}
                                </div>

                                <div className="mt-2 text-sm text-white/75">
                                    Накопительная скидка
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="mt-7 text-xl font-semibold">
                                    Карта не привязана
                                </div>

                                <div className="mt-2 text-sm text-white/75">
                                    Добавьте карту и получайте скидки.
                                </div>
                            </>
                        )}
                    </div>

                    {activeCard ? (
                        <div className="rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-[var(--accent)]">
                            {formatDiscountPercent(String(activeCard.discountPercent))}%
                        </div>
                    ) : null}
                </div>

                {activeCard ? (
                    <div className="mt-5 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm leading-snug text-white/90">
                        Карта привязана к профилю постоянно. Отвязать или заменить её может только менеджер магазина — напишите или
                        позвоните в магазин.
                    </div>
                ) : null}

                {!activeCard ? (
                    <button
                        type="button"
                        onClick={() => setAttachModalOpen(true)}
                        className="mt-6 w-full rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent-soft)]"
                    >
                        Добавить карту
                    </button>
                ) : null}
            </section>

            <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[0_24px_70px_rgba(31,23,34,0.05)]">
                <button
                    type="button"
                    onClick={logoutAction}
                    className="mt-2 flex w-full items-center justify-between rounded-2xl bg-[var(--accent)] px-4 py-3 text-left text-sm font-semibold text-white transition hover:opacity-90"
                >
                    Выйти
                    <span className="text-white/60">→</span>
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

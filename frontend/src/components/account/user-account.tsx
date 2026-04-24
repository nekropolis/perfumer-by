"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import AttachLoyaltyCardModal from "@/components/account/attach-loyalty-card-modal";
import { resolveActiveLoyaltyCard } from "@/lib/loyalty-pricing";

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
};

function formatDiscountPercent(value: string) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return value;
    }
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

export default function UserAccount({ user, logoutAction }: UserAccountProps) {
    const { refreshUser } = useAuth();
    const [attachModalOpen, setAttachModalOpen] = useState(false);

    const activeCard = resolveActiveLoyaltyCard(user?.discount_cards);

    return (
        <aside className="h-fit rounded-2xl border p-5">
            <div className="mb-5">
                <div className="mb-1 text-sm text-gray-500">Имя</div>
                <div className="font-medium">{user?.name || "—"}</div>
            </div>

            <div className="mb-6">
                <div className="mb-1 text-sm text-gray-500">Телефон</div>
                <div className="font-medium">{user?.phone || "—"}</div>
            </div>

            <div className="mb-6 border-t border-gray-100 pt-6">
                <div className="mb-1 text-sm text-gray-500">Накопительная карта</div>
                {activeCard ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
                        <div className="font-mono text-base font-semibold text-gray-900">{activeCard.number}</div>
                        <div className="mt-1 text-gray-700">Скидка {formatDiscountPercent(String(activeCard.discountPercent))}%</div>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setAttachModalOpen(true)}
                        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-left text-sm font-medium text-gray-900 hover:bg-gray-50"
                    >
                        Добавить карту
                    </button>
                )}
            </div>

            <div className="space-y-2">
                <button
                    type="button"
                    className="w-full rounded-xl bg-black px-4 py-3 text-left text-sm text-white"
                    onClick={logoutAction}
                >
                    Выйти
                </button>
            </div>

            {attachModalOpen ? (
                <AttachLoyaltyCardModal
                    onCloseAction={() => setAttachModalOpen(false)}
                    onSuccessAction={() => void refreshUser()}
                />
            ) : null}
        </aside>
    );
}

"use client";

import { useState } from "react";
import AccountPasswordChangeModal from "@/components/account/account-password-change-modal";

type AccountPasswordChangeProps = {
    phone: string;
};

export default function AccountPasswordChange({ phone }: AccountPasswordChangeProps) {
    const [modalOpen, setModalOpen] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");

    const handleSuccess = () => {
        setModalOpen(false);
        setSuccessMessage("Пароль успешно изменён");
    };

    return (
        <div className="border-t border-[var(--line)] pt-4">
            <button
                type="button"
                onClick={() => {
                    setSuccessMessage("");
                    setModalOpen(true);
                }}
                className="text-sm font-medium text-[var(--accent)] underline decoration-[var(--accent-soft)] underline-offset-[3px] transition hover:opacity-80"
            >
                Сменить пароль
            </button>

            {successMessage ? (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {successMessage}
                </div>
            ) : null}

            {modalOpen ? (
                <AccountPasswordChangeModal
                    phone={phone}
                    onCloseAction={() => setModalOpen(false)}
                    onSuccessAction={handleSuccess}
                />
            ) : null}
        </div>
    );
}

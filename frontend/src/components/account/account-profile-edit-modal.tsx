"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import AccountProfileEditPanel from "@/components/account/account-profile-edit-panel";
import type { AuthUserProfile } from "@/lib/auth-api";
import { siteBtnGhost } from "@/lib/site-ui-classes";

type AccountProfileEditModalProps = {
    user: AuthUserProfile;
    onCloseAction: () => void;
    onSavedAction: () => void;
};

export default function AccountProfileEditModal({
    user,
    onCloseAction,
    onSavedAction,
}: AccountProfileEditModalProps) {
    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key !== "Escape") {
                return;
            }
            if (document.querySelector("[data-account-overlay='password']")) {
                return;
            }
            onCloseAction();
        };

        const previousOverflow = document.body.style.overflow;
        document.addEventListener("keydown", handleEsc);
        document.body.style.overflow = "hidden";

        return () => {
            document.removeEventListener("keydown", handleEsc);
            document.body.style.overflow = previousOverflow;
        };
    }, [onCloseAction]);

    return createPortal(
        <div
            className="fixed inset-0 z-[180] flex items-center justify-center bg-admin-text/40 p-4 backdrop-blur-[2px] sm:p-6"
            onClick={onCloseAction}
            role="presentation"
        >
            <div
                className="relative w-full max-w-3xl"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="account-profile-edit-title"
            >
                <button
                    type="button"
                    onClick={onCloseAction}
                    className={`${siteBtnGhost} absolute right-3 top-3 z-10 h-9 w-9 p-0`}
                    aria-label="Закрыть"
                >
                    <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </button>
                <div className="max-h-[min(90vh,840px)] overflow-y-auto rounded-xl shadow-2xl">
                    <AccountProfileEditPanel
                        user={user}
                        onSavedAction={onSavedAction}
                        onCancelAction={onCloseAction}
                    />
                </div>
            </div>
        </div>,
        document.body,
    );
}

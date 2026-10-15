"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";
import { adminModalOverlay, adminModalPanel } from "@/lib/admin-ui-classes";

type Props = {
    open: boolean;
    onCloseAction: () => void;
    title?: string;
    children: ReactNode;
    footer?: ReactNode;
    maxWidthClass?: string;
    className?: string;
    /** false: закрывать только крестиком / кнопкой в футере, не по клику на оверлей */
    closeOnOverlayClick?: boolean;
};

export default function AdminModalShell({
    open,
    onCloseAction,
    title,
    children,
    footer,
    maxWidthClass = "sm:max-w-lg",
    className = "",
    closeOnOverlayClick = true,
}: Props) {
    const [mounted, setMounted] = useState(false);
    const titleId = useId();
    const panelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    // Escape следует той же семантике, что и клик по оверлею.
    useDialogA11y({
        open: open && mounted,
        containerRef: panelRef,
        onClose: onCloseAction,
        closeOnEscape: closeOnOverlayClick,
    });

    if (!open || !mounted) {
        return null;
    }

    return createPortal(
        <div
            className={adminModalOverlay}
            onClick={closeOnOverlayClick ? onCloseAction : undefined}
            role="presentation"
        >
            <div
                ref={panelRef}
                className={`${adminModalPanel} ${maxWidthClass} ${className}`}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
            >
                {title ? (
                    <div className="flex flex-none items-center justify-between gap-3 border-b border-admin-border px-4 py-3 sm:px-5">
                        <h2 id={titleId} className="text-base font-semibold text-admin-text">{title}</h2>
                        <button
                            type="button"
                            onClick={onCloseAction}
                            className="rounded-lg p-1.5 text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text"
                            aria-label="Закрыть"
                        >
                            <X size={18} />
                        </button>
                    </div>
                ) : null}
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
                {footer ? (
                    <div className="flex-none border-t border-admin-border px-4 py-3 sm:px-5">{footer}</div>
                ) : null}
            </div>
        </div>,
        document.body,
    );
}

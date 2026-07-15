"use client";

import { Menu, X } from "lucide-react";
import { headerBtnIcon } from "@/lib/site-ui-classes";

type HeaderMobileToggleProps = {
    isOpen: boolean;
    onClickAction: () => void;
};

export default function HeaderMobileToggle({
    isOpen,
    onClickAction,
}: HeaderMobileToggleProps) {
    return (
        <button
            type="button"
            className={`${headerBtnIcon} md:hidden`}
            onClick={onClickAction}
            aria-label={isOpen ? "Закрыть меню" : "Открыть меню"}
        >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
    );
}

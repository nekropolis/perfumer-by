"use client";

import { LayoutGrid } from "lucide-react";
import { siteBtnSecondary } from "@/lib/site-ui-classes";

type HeaderCatalogButtonProps = {
    label: string;
    onClickAction: () => void;
};

export default function HeaderCatalogButton({
    label,
    onClickAction,
}: HeaderCatalogButtonProps) {
    return (
        <button
            type="button"
            className={`${siteBtnSecondary} hidden h-11 gap-2 md:inline-flex`}
            onClick={onClickAction}
        >
            <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
            {label}
        </button>
    );
}

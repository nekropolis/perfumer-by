import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Breadcrumbs from "@/components/ui/breadcrumbs";

type Crumb = {
    label: string;
    href?: string;
};

type Props = {
    backHref: string;
    backAriaLabel?: string;
    items: Crumb[];
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
};

export default function AdminCrudHeader({
    backHref,
    backAriaLabel = "Назад",
    items,
    title,
    description,
    actions,
}: Props) {
    return (
        <div className="mb-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="flex h-5 min-w-0 items-center gap-1.5">
                    <Link
                        href={backHref}
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-admin-text-secondary transition hover:text-admin-text"
                        aria-label={backAriaLabel}
                        title="Назад"
                    >
                        <ChevronLeft size={16} />
                    </Link>
                    <Breadcrumbs alwaysShow className="leading-5" items={items} />
                </div>
                <h1 className="w-full min-w-0 text-left text-sm font-semibold leading-5 text-admin-text sm:ml-auto sm:w-auto sm:text-right">
                    {title}
                </h1>
            </div>
            {description ? (
                <div className="mt-2 text-sm text-admin-text-secondary">{description}</div>
            ) : null}
            {actions ? (
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">{actions}</div>
            ) : null}
        </div>
    );
}

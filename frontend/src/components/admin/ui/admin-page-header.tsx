import type { ReactNode } from "react";
import { adminPageSubtitle, adminPageTitle } from "@/lib/admin-ui-classes";

type Props = {
    title: string;
    description?: string;
    actions?: ReactNode;
    className?: string;
};

export default function AdminPageHeader({ title, description, actions, className = "" }: Props) {
    return (
        <div className={`mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between ${className}`}>
            <div className="min-w-0">
                <h1 className={adminPageTitle}>{title}</h1>
                {description ? <p className={adminPageSubtitle}>{description}</p> : null}
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
    );
}

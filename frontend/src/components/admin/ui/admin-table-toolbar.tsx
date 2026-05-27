import type { ReactNode } from "react";
import { adminPageSubtitle, adminPageTitle } from "@/lib/admin-ui-classes";

type Props = {
    title?: string;
    description?: string;
    action?: ReactNode;
    children?: ReactNode;
};

export default function AdminTableToolbar({ title, description, action, children }: Props) {
    const hasHeader = Boolean(title || description || action);

    return (
        <div className="mb-4">
            {hasHeader ? (
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        {title ? <h2 className={adminPageTitle}>{title}</h2> : null}

                        {description ? <p className={adminPageSubtitle}>{description}</p> : null}
                    </div>

                    {action ? <div className="shrink-0">{action}</div> : null}
                </div>
            ) : null}

            {children ? (
                <div
                    className={`${hasHeader ? "mt-4" : ""} flex flex-col gap-3 rounded-xl border border-admin-border bg-admin-muted p-3 md:flex-row md:flex-wrap md:items-end md:justify-between`}
                >
                    {children}
                </div>
            ) : null}
        </div>
    );
}

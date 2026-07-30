import type { ReactNode } from "react";

type Props = {
    total?: number;
    children: ReactNode;
    footer?: ReactNode;
    /** Right-side controls (search, selects) — one row with total on desktop */
    search?: ReactNode;
};

export default function AdminTableShell({ total, children, footer, search }: Props) {
    return (
        <div className="space-y-3">
            <div className="flex flex-col gap-3 rounded-lg border border-admin-border bg-admin-muted px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4">
                <div className="shrink-0 text-sm text-admin-text-secondary">
                    Всего: <span className="font-semibold text-admin-text">{total ?? 0}</span>
                </div>

                {search ? (
                    <div className="flex min-w-0 w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:max-w-full sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                        {search}
                    </div>
                ) : null}
            </div>

            <div className="overflow-hidden rounded-xl border border-admin-border bg-admin-surface shadow-admin-card">
                <div className="overflow-x-auto">{children}</div>
            </div>

            {footer ? <div>{footer}</div> : null}
        </div>
    );
}

import type { ReactNode } from "react";

type Props = {
    total?: number;
    children: ReactNode;
    footer?: ReactNode;
    search?: ReactNode;
};

export default function AdminTableShell({ total, children, footer, search }: Props) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-3">
                <div className="text-sm text-gray-500">
                    Всего: <span className="font-medium text-gray-900">{total ?? 0}</span>
                </div>

                {search ? <div>{search}</div> : null}
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="overflow-x-auto">{children}</div>
            </div>

            {footer ? <div>{footer}</div> : null}
        </div>
    );
}

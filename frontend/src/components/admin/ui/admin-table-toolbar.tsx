import type { ReactNode } from "react";

type Props = {
    title: string;
    description?: string;
    action?: ReactNode;
    children?: ReactNode;
};

export default function AdminTableToolbar({
                                              title,
                                              description,
                                              action,
                                              children,
                                          }: Props) {
    return (
        <div className="mb-6 rounded-2xl border border-gray-100 bg-gray-50/70 p-4 sm:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-gray-950">
                        {title}
                    </h2>

                    {description ? (
                        <p className="mt-1 text-sm leading-6 text-gray-600">
                            {description}
                        </p>
                    ) : null}
                </div>

                {action ? <div className="shrink-0">{action}</div> : null}
            </div>

            {children ? (
                <div className="mt-4 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between">
                    {children}
                </div>
            ) : null}
        </div>
    );
}

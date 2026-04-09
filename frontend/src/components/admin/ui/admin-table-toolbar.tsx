import type { ReactNode } from "react";

type Props = {
    title: string;
    description?: string;
    children?: ReactNode;
};

export default function AdminTableToolbar({
                                              title,
                                              description,
                                              children,
                                          }: Props) {
    return (
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
                <h2 className="text-2xl font-semibold">{title}</h2>
                {description && (
                    <p className="mt-1 text-sm text-gray-600">{description}</p>
                )}
            </div>

            {children && (
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                    {children}
                </div>
            )}
        </div>
    );
}
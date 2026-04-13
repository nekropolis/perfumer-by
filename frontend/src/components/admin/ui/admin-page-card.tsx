import type { ReactNode } from "react";

type Props = {
    children: ReactNode;
    className?: string;
};

export default function AdminPageCard({ children, className = "" }: Props) {
    return (
        <div className={`rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
            {children}
        </div>
    );
}

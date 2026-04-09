import type { ReactNode } from "react";

type Props = {
    children: ReactNode;
    className?: string;
};

export default function AdminPageCard({ children, className = "" }: Props) {
    return (
        <div className={`rounded-2xl border bg-white p-5 ${className}`}>
            {children}
        </div>
    );
}
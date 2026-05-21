import type { ReactNode } from "react";
import { adminCard, adminCardPadding } from "@/lib/admin-ui-classes";

type Props = {
    children: ReactNode;
    className?: string;
};

export default function AdminPageCard({ children, className = "" }: Props) {
    return <div className={`${adminCard} ${adminCardPadding} ${className}`}>{children}</div>;
}

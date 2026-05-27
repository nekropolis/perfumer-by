import type { ReactNode } from "react";
import { adminCardPadding, adminPageShell } from "@/lib/admin-ui-classes";

type Props = {
    children: ReactNode;
    className?: string;
};

export default function AdminPageCard({ children, className = "" }: Props) {
    return <div className={`${adminPageShell} ${adminCardPadding} ${className}`}>{children}</div>;
}

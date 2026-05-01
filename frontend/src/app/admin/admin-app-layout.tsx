"use client";

import type { ReactNode } from "react";
import AdminGuard from "@/components/admin/admin-guard";
import AdminShell from "@/components/admin/admin-shell";

type Props = {
    children: ReactNode;
};

export default function AdminAppLayout({ children }: Props) {
    return (
        <AdminGuard>
            <AdminShell>{children}</AdminShell>
        </AdminGuard>
    );
}

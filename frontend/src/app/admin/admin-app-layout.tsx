"use client";

import type { ReactNode } from "react";
import AdminGuard from "@/components/admin/admin-guard";
import AdminShell from "@/components/admin/admin-shell";
import IncomingCallListener from "@/components/admin/incoming-call-listener";

type Props = {
    children: ReactNode;
};

export default function AdminAppLayout({ children }: Props) {
    return (
        <AdminGuard>
            <IncomingCallListener />
            <AdminShell>{children}</AdminShell>
        </AdminGuard>
    );
}

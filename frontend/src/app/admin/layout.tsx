import type { ReactNode } from "react";
import type { Metadata } from "next";
import { matrixRouteMetadata } from "@/lib/seo";
import AdminAppLayout from "./admin-app-layout";

export const metadata: Metadata = matrixRouteMetadata();

type Props = {
    children: ReactNode;
};

export default function AdminLayout({ children }: Props) {
    return <AdminAppLayout>{children}</AdminAppLayout>;
}
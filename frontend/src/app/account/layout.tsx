import type { ReactNode } from "react";
import type { Metadata } from "next";
import { matrixRouteMetadata } from "@/lib/seo";

export const metadata: Metadata = matrixRouteMetadata("Личный кабинет");

export default function AccountSegmentLayout({ children }: { children: ReactNode }) {
    return children;
}

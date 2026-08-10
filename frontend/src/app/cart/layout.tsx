import type { ReactNode } from "react";
import type { Metadata } from "next";
import { matrixRouteMetadata } from "@/lib/seo";

export const metadata: Metadata = matrixRouteMetadata("Корзина");

export default function CartSegmentLayout({ children }: { children: ReactNode }) {
    return children;
}

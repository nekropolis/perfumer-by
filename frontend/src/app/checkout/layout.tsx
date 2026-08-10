import type { ReactNode } from "react";
import type { Metadata } from "next";
import { matrixRouteMetadata } from "@/lib/seo";

export const metadata: Metadata = matrixRouteMetadata("Оформление заказа");

export default function CheckoutSegmentLayout({ children }: { children: ReactNode }) {
    return children;
}

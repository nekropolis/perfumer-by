import type { ReactNode } from "react";
import type { Metadata } from "next";
import { matrixRouteMetadata } from "@/lib/seo";

export const metadata: Metadata = matrixRouteMetadata();

export default function CheckoutSegmentLayout({ children }: { children: ReactNode }) {
    return children;
}

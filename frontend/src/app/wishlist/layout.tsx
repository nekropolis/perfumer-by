import type { ReactNode } from "react";
import type { Metadata } from "next";
import { matrixRouteMetadata } from "@/lib/seo";

export const metadata: Metadata = matrixRouteMetadata();

export default function WishlistSegmentLayout({ children }: { children: ReactNode }) {
    return children;
}

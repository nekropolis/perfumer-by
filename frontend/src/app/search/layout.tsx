import type { ReactNode } from "react";
import type { Metadata } from "next";
import { searchRouteMetadata } from "@/lib/seo";

export const metadata: Metadata = searchRouteMetadata();

export default function SearchSegmentLayout({ children }: { children: ReactNode }) {
    return children;
}

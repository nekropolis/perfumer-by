"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SiteContent } from "@/lib/site-content-api";
import { DEFAULT_SITE_CONTENT } from "@/lib/site-content-api";

const SiteContentContext = createContext<SiteContent>(DEFAULT_SITE_CONTENT);

type Props = {
    value: SiteContent;
    children: ReactNode;
};

export function SiteContentProvider({ value, children }: Props) {
    return <SiteContentContext.Provider value={value}>{children}</SiteContentContext.Provider>;
}

export function useSiteContent(): SiteContent {
    return useContext(SiteContentContext);
}

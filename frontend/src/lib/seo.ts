import type { Metadata } from "next";

type SeoInput = {
    title: string;
    description: string;
    canonicalPath: string;
};

const SITE_NAME = "Perfumer";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://192.168.0.25";

export function buildSeoMetadata({
                                     title,
                                     description,
                                     canonicalPath,
                                 }: SeoInput): Metadata {
    const canonical = `${SITE_URL}${canonicalPath}`;

    return {
        title,
        description,
        alternates: {
            canonical,
        },
        openGraph: {
            title,
            description,
            url: canonical,
            siteName: SITE_NAME,
            type: "website",
        },
    };
}

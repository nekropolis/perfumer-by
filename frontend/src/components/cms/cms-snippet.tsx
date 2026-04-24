"use client";

import { useEffect, useState } from "react";
import { fetchCmsBlockByCode, type CmsPublicBlock } from "@/lib/cms-pages-api";

type Props = {
    code: string;
    className?: string;
    fallbackTitle?: string;
};

export default function CmsSnippet({ code, className = "", fallbackTitle }: Props) {
    const [block, setBlock] = useState<CmsPublicBlock | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        void fetchCmsBlockByCode(code)
            .then((res) => {
                if (cancelled) return;
                setBlock(res);
            })
            .catch(() => {
                if (cancelled) return;
                setBlock(null);
            })
            .finally(() => {
                if (cancelled) return;
                setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [code]);

    if (loading || !block) {
        return null;
    }

    return (
        <section className={className}>
            {(block.name || fallbackTitle) ? (
                <h2 className="mb-4 text-2xl font-semibold">{block.name || fallbackTitle}</h2>
            ) : null}
            {block.content ? (
                <div
                    className="ProseMirror prose prose-sm max-w-none text-[var(--foreground)] sm:prose-base"
                    dangerouslySetInnerHTML={{ __html: block.content }}
                />
            ) : null}
        </section>
    );
}

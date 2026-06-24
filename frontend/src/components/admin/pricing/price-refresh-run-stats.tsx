"use client";

import { buildPriceRefreshStatsBlocks } from "@/lib/price-refresh-ui";

type Props = {
    stats?: Record<string, unknown> | null;
    errorMessage?: string | null;
    compact?: boolean;
};

export default function PriceRefreshRunStats({ stats, errorMessage, compact = false }: Props) {
    if (errorMessage) {
        return <p className="text-xs text-red-700">{errorMessage}</p>;
    }

    const blocks = buildPriceRefreshStatsBlocks(stats);
    if (blocks.length === 0) {
        return <span>—</span>;
    }

    return (
        <div className={compact ? "space-y-1.5" : "space-y-2"}>
            {blocks.map((block) => (
                <div key={block.title}>
                    <div className="text-xs font-medium text-admin-text">{block.title}</div>
                    <div className="text-xs text-admin-text-secondary">{block.lines.join(" · ")}</div>
                </div>
            ))}
        </div>
    );
}

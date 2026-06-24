import type { PriceRefreshJobStatus } from "@/lib/admin-pricing-api";

export function clampProgress(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
}

function parseCounterFromMessage(message?: string | null): { processed: number; total: number } | null {
    if (!message) return null;
    const match = message.match(/(\d[\d\s]*)\s*\/\s*(\d[\d\s]*)/);
    if (!match) return null;
    return {
        processed: Number(match[1].replace(/\s+/g, "")),
        total: Number(match[2].replace(/\s+/g, "")),
    };
}

export function resolvePriceRefreshProgress(
    status: PriceRefreshJobStatus | null,
    isActive: boolean,
): { processed: number; total: number; progress: number; message: string } {
    if (!status) {
        return { processed: 0, total: 0, progress: 0, message: "" };
    }

    if (status.status === "completed") {
        return {
            processed: Number(status.processed ?? 0),
            total: Number(status.total ?? status.total_linked ?? 0),
            progress: 100,
            message: status.message?.trim() || "Обновление цен завершено",
        };
    }

    let processed = Number(status.processed ?? 0);
    let total = Number(status.total ?? status.total_linked ?? 0);

    if (total <= 0) {
        const fromMessage = parseCounterFromMessage(status.message);
        if (fromMessage) {
            processed = fromMessage.processed;
            total = fromMessage.total;
        }
    }

    let progress = 0;
    if (total > 0) {
        progress = Math.round((processed / total) * 100);
    } else if (isActive) {
        progress = 5;
    }

    return {
        processed,
        total,
        progress: clampProgress(progress),
        message: status.message?.trim() || "Ожидание…",
    };
}

export type PriceRefreshStatsBlock = {
    title: string;
    lines: string[];
};

export function buildPriceRefreshStatsBlocks(
    stats: Record<string, unknown> | null | undefined,
): PriceRefreshStatsBlock[] {
    if (!stats) return [];

    const blocks: PriceRefreshStatsBlock[] = [];
    const warehouse = stats.warehouse as Record<string, number> | undefined;

    if (warehouse) {
        blocks.push({
            title: "Склад",
            lines: [
                `обновлено ${warehouse.updated ?? 0}`,
                `смешанная база ${warehouse.blended_updated ?? 0}`,
                `ручная очередь +${warehouse.manual_queued ?? 0}`,
                `снято ${warehouse.manual_resolved ?? 0}`,
            ],
        });
    }

    const suppliers = stats.suppliers as Record<string, Record<string, number | boolean>> | undefined;
    if (suppliers) {
        for (const [code, row] of Object.entries(suppliers)) {
            if (row.skipped) continue;
            blocks.push({
                title: code,
                lines: [
                    `обновлено ${row.updated ?? 0}`,
                    `без изменений ${row.unchanged ?? 0}`,
                    `пропало ${row.missing_from_price_file ?? 0}`,
                ],
            });
        }
    }

    return blocks;
}

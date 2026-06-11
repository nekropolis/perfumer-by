"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import {
    fetchSellerOneActiveStatus,
    fetchVanilleParseStatus,
} from "@/lib/admin-vanille-api";
import type {
    SellerOneParseStatus,
    VanilleImportQueueJob,
} from "@/types/Vanille";
import { useSmartPolling } from "@/hooks/use-smart-polling";

// Активный джоб — живой прогресс, хотим видеть каждые 5 секунд.
// В «тишине» опрашиваем реже, чтобы не шуметь в сети и не греть сервер.
const ACTIVE_INTERVAL_MS = 5_000;
const IDLE_INTERVAL_MS = 20_000;

type ActiveTask = {
    key: string;
    title: string;
    statusLabel: string;
    message?: string | null;
    counter?: string | null;
    progress: number;
};

type Props = {
    compact?: boolean;
    className?: string;
};

const VANILLE_TYPE_LABELS: Record<VanilleImportQueueJob["type"], string> = {
    parse_brands: "Парсинг брендов Vanille",
    collect_links: "Сбор ссылок Vanille",
    parse_products: "Парсинг товаров Vanille",
    parse_catalog_images: "Каталожные изображения Vanille",
    parse_product_images: "Галерея изображений Vanille",
    rewrite_descriptions: "Уникализация описаний Vanille",
    import_parsed_products: "Импорт Vanille",
    pipeline_new_products: "Пайплайн Vanille (новые)",
    pipeline_refresh_all: "Пайплайн Vanille (обновление)",
};

const VANILLE_STATUS_LABELS: Record<VanilleImportQueueJob["status"], string> = {
    pending: "в очереди",
    running: "выполняется",
    completed: "завершено",
    failed: "ошибка",
};

const SELLER_ONE_STATUS_LABELS: Record<SellerOneParseStatus["status"], string> = {
    queued: "в очереди",
    running: "выполняется",
    completed: "завершено",
    failed: "ошибка",
};

function isVanilleActive(status: VanilleImportQueueJob["status"] | undefined): boolean {
    return status === "pending" || status === "running";
}

function isSellerOneActive(status: SellerOneParseStatus["status"] | undefined): boolean {
    return status === "queued" || status === "running";
}

function clampProgress(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
}

function extractCounter(source: string | null | undefined): string | null {
    if (!source) return null;
    const match = source.match(/(\d[\d\s]*)\s*\/\s*(\d[\d\s]*)/);
    if (!match) return null;
    const left = match[1].replace(/\s+/g, "");
    const right = match[2].replace(/\s+/g, "");
    return `${left} / ${right}`;
}

function buildVanilleTask(job: VanilleImportQueueJob): ActiveTask {
    return {
        key: `vanille:${job.id}`,
        title: VANILLE_TYPE_LABELS[job.type] ?? job.type,
        statusLabel: VANILLE_STATUS_LABELS[job.status] ?? job.status,
        message: job.message,
        counter: extractCounter(job.message),
        progress: clampProgress(job.progress),
    };
}

function buildSellerOneTask(status: SellerOneParseStatus): ActiveTask {
    const isRefresh = status.job_type === "refresh_linked";
    const processed = Number(status.processed ?? 0);
    const totalRows = isRefresh ? Number(status.total_linked ?? 0) : Number(status.total_rows ?? 0);
    const isRunning = status.status === "running";
    const statusMessage = status.message?.trim() || "";
    const isPrepMessage =
        isRunning
        && statusMessage !== ""
        && (processed === 0 || statusMessage.startsWith("Подготовка:") || statusMessage.startsWith("Продолжение:"));
    const progress =
        totalRows > 0 && processed > 0
            ? Math.round((processed / totalRows) * 100)
            : isRunning
                ? totalRows > 0
                    ? 3
                    : 5
                : 0;
    const counter = totalRows > 0 && processed > 0 ? `${processed} / ${totalRows}` : null;
    const message =
        isPrepMessage
            ? statusMessage
            : totalRows > 0
                ? (isRefresh ? `Обновление цен ${processed} / ${totalRows}` : `Обработано ${processed} / ${totalRows}`)
                : statusMessage || "Ожидание…";
    return {
        key: `seller-one:${status.job_id}:${status.job_type ?? "parse"}`,
        title: isRefresh ? "Цены Seller One" : "Парсинг Seller One",
        statusLabel: SELLER_ONE_STATUS_LABELS[status.status] ?? status.status,
        message,
        counter,
        progress: clampProgress(progress),
    };
}

export default function AdminActiveTasksWidget({ compact = false, className }: Props) {
    const [tasks, setTasks] = useState<ActiveTask[]>([]);

    const load = useCallback(async (): Promise<{ active: boolean }> => {
        // Оба источника активности опрашиваем параллельно:
        //   • Vanille — backend сам возвращает текущий активный джоб по БД.
        //   • Seller One — используем discovery-эндпоинт (/supplier-price/active),
        //     чтобы не зависеть от localStorage: джоб мог быть запущен в другой
        //     вкладке / браузере / сессии — всё равно нужно показать.
        const [vanilleRes, sellerOneRes] = await Promise.allSettled([
            fetchVanilleParseStatus(),
            fetchSellerOneActiveStatus(),
        ]);

        const next: ActiveTask[] = [];

        if (vanilleRes.status === "fulfilled") {
            const job = vanilleRes.value?.data ?? null;
            if (job && isVanilleActive(job.status)) {
                next.push(buildVanilleTask(job));
            }
        }

        if (sellerOneRes.status === "fulfilled") {
            const status = sellerOneRes.value?.data ?? null;
            if (status && isSellerOneActive(status.status)) {
                next.push(buildSellerOneTask(status));
            }
        }

        setTasks(next);

        // Подсказываем хуку: есть активные задачи — жми на газ (5s), нет — идём на idle-интервал.
        return { active: next.length > 0 };
    }, []);

    useSmartPolling({
        activeIntervalMs: ACTIVE_INTERVAL_MS,
        idleIntervalMs: IDLE_INTERVAL_MS,
        fetcherAction: load,
    });

    if (tasks.length === 0) {
        return null;
    }

    return (
        <div className={className ?? (compact ? "flex items-center gap-2" : "hidden items-center gap-2 sm:flex")}>
            {tasks.map((task) => (
                <div
                    key={task.key}
                    role="status"
                    aria-live="polite"
                    title={task.message ? `${task.title}: ${task.message} · ${task.statusLabel}` : task.title}
                    className={`inline-flex ${compact ? "h-9 max-w-[220px]" : "h-10 max-w-[260px]"} cursor-default items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-2.5 text-xs shadow-sm`}
                >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-emerald-600 shadow-inner">
                        <Loader2 size={13} className="animate-spin" />
                    </span>

                    <span className="flex min-w-0 flex-col leading-tight">
                        <span className="flex min-w-0 items-baseline gap-1.5">
                            <span className="truncate text-[11px] font-semibold text-emerald-800">
                                {task.title}
                            </span>
                            {task.counter ? (
                                <span className="shrink-0 text-[10px] font-medium tabular-nums text-emerald-700/80">
                                    {task.counter}
                                </span>
                            ) : null}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                            <span className="h-[3px] w-20 overflow-hidden rounded-full bg-emerald-100">
                                <span
                                    className="block h-full rounded-full bg-emerald-500 transition-all"
                                    style={{ width: `${Math.max(2, task.progress)}%` }}
                                />
                            </span>
                            <span className="shrink-0 text-[10px] font-medium tabular-nums text-emerald-700">
                                {task.progress}%
                            </span>
                        </span>
                    </span>
                </div>
            ))}
        </div>
    );
}

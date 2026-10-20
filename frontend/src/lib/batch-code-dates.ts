const MONTHS_RU_NOMINATIVE = [
    "январь",
    "февраль",
    "март",
    "апрель",
    "май",
    "июнь",
    "июль",
    "август",
    "сентябрь",
    "октябрь",
    "ноябрь",
    "декабрь",
] as const;

/** `YYYY-MM` или `YYYY-MM-DD` → «март 2019» или «15 марта 2019». */
export function formatBatchCodeDateLabel(
    value: string,
    precision: "year" | "month" | null = "month",
): string {
    const trimmed = value.trim();
    if (!trimmed) {
        return trimmed;
    }

    const yearOnly = /^\d{4}$/.test(trimmed);
    if (yearOnly || precision === "year") {
        const year = yearOnly ? trimmed : trimmed.slice(0, 4);
        if (/^\d{4}$/.test(year)) {
            return year;
        }
    }

    const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (dayMatch) {
        const [, y, m, d] = dayMatch;
        const monthIndex = Number(m) - 1;
        if (monthIndex >= 0 && monthIndex < 12) {
            return `${Number(d)} ${MONTHS_RU_NOMINATIVE[monthIndex]} ${y}`;
        }
    }

    const monthMatch = /^(\d{4})-(\d{2})$/.exec(trimmed);
    if (monthMatch) {
        const [, y, m] = monthMatch;
        const monthIndex = Number(m) - 1;
        if (monthIndex >= 0 && monthIndex < 12) {
            return `${MONTHS_RU_NOMINATIVE[monthIndex]} ${y}`;
        }
    }

    return trimmed;
}

export function formatBatchCodePeriod(args: {
    date_from: string | null;
    date_to: string | null;
    precision: "year" | "month" | null;
}): string | null {
    const { date_from, date_to, precision } = args;
    if (!date_from && !date_to) {
        return null;
    }

    const fromLabel = date_from ? formatBatchCodeDateLabel(date_from, precision) : null;
    const toLabel = date_to ? formatBatchCodeDateLabel(date_to, precision) : null;

    if (fromLabel && toLabel) {
        if (fromLabel === toLabel) {
            return fromLabel;
        }
        return `с ${fromLabel} по ${toLabel}`;
    }

    return fromLabel ?? toLabel;
}

export function batchCodeConfidenceLabel(confidence: "low" | "medium" | null): string | null {
    if (confidence === "low") {
        return "Низкая уверенность";
    }
    if (confidence === "medium") {
        return "Средняя уверенность";
    }
    return null;
}

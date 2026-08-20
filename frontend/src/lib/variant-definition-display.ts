const SET_LABEL = "Набор";

export function formatSetConcentrationDescription(raw?: string | null): string {
    const text = (raw ?? "").trim();
    if (!text) {
        return "";
    }

    const parts: string[] = [];
    const seen = new Set<string>();

    for (const part of text.split("/").map((item) => item.trim()).filter(Boolean)) {
        const key = part.toLocaleLowerCase("ru-RU");
        if (key === SET_LABEL.toLocaleLowerCase("ru-RU") || seen.has(key)) {
            continue;
        }
        seen.add(key);
        parts.push(part);
    }

    return parts.join(" / ");
}

/** «Набор (50/12,5) - парфюмерная вода». */
export function formatSetDisplayTitle(input: {
    title?: string | null;
    volumeLabel?: string | null;
    concentrationLabel?: string | null;
}): string {
    const volumeLabel = (input.volumeLabel ?? "").trim();
    const base = volumeLabel
        ? `${SET_LABEL} (${volumeLabel})`
        : ((input.title ?? "").trim() || SET_LABEL);

    const description = formatSetConcentrationDescription(input.concentrationLabel);
    if (!description) {
        return base;
    }

    if (base.toLocaleLowerCase("ru-RU").includes(description.toLocaleLowerCase("ru-RU"))) {
        return base;
    }

    return `${base} - ${description}`;
}

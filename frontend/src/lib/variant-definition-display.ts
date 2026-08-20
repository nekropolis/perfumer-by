const SET_LABEL = "Набор";

export function formatSetConcentrationDescription(raw?: string | null): string {
    const text = (raw ?? "").trim();
    if (!text) {
        return "";
    }

    const parts: string[] = [];

    for (const part of text.split("/").map((item) => item.trim()).filter(Boolean)) {
        if (part.toLocaleLowerCase("ru-RU") === SET_LABEL.toLocaleLowerCase("ru-RU")) {
            continue;
        }
        parts.push(part);
    }

    return parts.join(" / ");
}

/** «Набор (50/12,5) - парфюмерная вода / парфюмерная вода». */
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

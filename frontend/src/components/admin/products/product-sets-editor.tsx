"use client";

import { useEffect, useState } from "react";
import useDebouncedValue from "@/hooks/use-debounced-value";
import { type ProductSetAdminItem } from "@/lib/admin-products-api";
import {
    fetchVariantDefinitions,
    type VariantDefinitionItem,
} from "@/lib/admin-product-variants-api";

export type ProductSetDraftRow = {
    key: string;
    volume_label: string;
    concentration_label: string;
    title: string;
    definition_id?: number;
};

function formatVolumeLabel(volumeMl: number): string {
    const normalized = Math.round(volumeMl * 10) / 10;
    if (Math.abs(normalized - Math.round(normalized)) < 0.001) {
        return String(Math.round(normalized));
    }
    return String(normalized).replace(".", ",");
}

function buildConcentrationLabel(item: VariantDefinitionItem): string {
    let label = (item.concentration_label || item.concentration_code || "").trim();
    if (!label) {
        return "";
    }
    if (item.is_tester) {
        label += " / Тестер";
    }
    if (item.is_vial) {
        label += " / Пробник";
    }
    if (item.is_miniature) {
        label += " / Миниатюра";
    }
    return label;
}

function definitionDraftParts(item: VariantDefinitionItem): Omit<ProductSetDraftRow, "key"> | null {
    const volumeLabel =
        item.volume_ml != null
            ? formatVolumeLabel(item.volume_ml)
            : (item.volume_label || "").trim();
    const concentrationLabel = buildConcentrationLabel(item);
    if (!volumeLabel || !concentrationLabel) {
        return null;
    }

    return {
        volume_label: volumeLabel,
        concentration_label: concentrationLabel,
        title: `${volumeLabel} · ${concentrationLabel}`,
        definition_id: item.id,
    };
}

let draftRowSeq = 0;

export function draftFromDefinition(item: VariantDefinitionItem): ProductSetDraftRow | null {
    const parts = definitionDraftParts(item);
    if (!parts) {
        return null;
    }

    draftRowSeq += 1;

    return {
        key: `def-${item.id}-${draftRowSeq}`,
        ...parts,
    };
}

export function draftsFromSetComponents(
    components: ProductSetAdminItem["components"],
): ProductSetDraftRow[] {
    return components.map((row, index) => {
        const key = `row-${index}-${row.volume_label.trim().toLowerCase()}|${row.concentration_label.trim().toLowerCase()}`;
        return {
            key,
            volume_label: row.volume_label,
            concentration_label: row.concentration_label,
            title: `${row.volume_label} · ${row.concentration_label}`,
        };
    });
}

function splitJoinedSetParts(value: string): string[] {
    const protectedValue = value.replaceAll(" / ", "\u0000");
    return protectedValue
        .split("/")
        .map((part) => part.replaceAll("\u0000", " / ").trim())
        .filter(Boolean);
}

export function draftsFromSetDefinitionLabels(
    volumeLabel?: string | null,
    concentrationLabel?: string | null,
): ProductSetDraftRow[] {
    const volumes = splitJoinedSetParts(volumeLabel ?? "");
    if (volumes.length === 0) {
        return [];
    }

    const concentrations = splitJoinedSetParts(concentrationLabel ?? "");

    return volumes.map((volume, index) => {
        const concentration = concentrations[index] ?? concentrations[0] ?? "";
        return {
            key: `vol-${index}-${volume.toLowerCase()}|${concentration.toLowerCase()}`,
            volume_label: volume,
            concentration_label: concentration,
            title: concentration ? `${volume} · ${concentration}` : volume,
        };
    });
}

export function setLabelsFromDraftRows(rows: ProductSetDraftRow[]): {
    volume_label: string;
    concentration_label: string;
} {
    return {
        volume_label: rows.map((row) => row.volume_label).join("/"),
        concentration_label: rows.map((row) => row.concentration_label).join("/"),
    };
}

function countDefinitionInDraft(item: VariantDefinitionItem, draftRows: ProductSetDraftRow[]): number {
    const parts = definitionDraftParts(item);
    if (!parts) {
        return 0;
    }

    return draftRows.filter(
        (row) =>
            row.definition_id === item.id ||
            (row.volume_label === parts.volume_label &&
                row.concentration_label === parts.concentration_label),
    ).length;
}

type CompositionPickerProps = {
    draftRows: ProductSetDraftRow[];
    onChangeAction: (rows: ProductSetDraftRow[]) => void;
};

export function ProductSetCompositionPicker({
    draftRows,
    onChangeAction,
}: CompositionPickerProps) {
    const [variantSearch, setVariantSearch] = useState("");
    const debouncedSearch = useDebouncedValue(variantSearch, 250);
    const [definitions, setDefinitions] = useState<VariantDefinitionItem[]>([]);
    const [definitionsLoading, setDefinitionsLoading] = useState(false);
    const [searchError, setSearchError] = useState("");

    useEffect(() => {
        const trimmed = debouncedSearch.trim();
        if (trimmed === "") {
            setDefinitions([]);
            setDefinitionsLoading(false);
            return;
        }

        let cancelled = false;
        setDefinitionsLoading(true);
        void fetchVariantDefinitions({ search: trimmed, is_set: false })
            .then((data) => {
                if (cancelled) return;
                setDefinitions(data.data || []);
                setSearchError("");
            })
            .catch((e: unknown) => {
                if (!cancelled) {
                    setSearchError(e instanceof Error ? e.message : "Ошибка поиска вариантов");
                }
            })
            .finally(() => {
                if (!cancelled) setDefinitionsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [debouncedSearch]);

    const removeDraftRow = (key: string) => {
        onChangeAction(draftRows.filter((row) => row.key !== key));
    };

    const addDefinition = (item: VariantDefinitionItem) => {
        const next = draftFromDefinition(item);
        if (!next) return;
        onChangeAction([...draftRows, next]);
    };

    return (
        <div className="space-y-2">
            <label className="block text-sm text-admin-text-secondary">
                Состав набора — поиск по объёму, одинаковые можно добавлять несколько раз
            </label>
            {draftRows.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                    {draftRows.map((row) => (
                        <span
                            key={row.key}
                            className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-xs"
                        >
                            {row.title}
                            <button type="button" onClick={() => removeDraftRow(row.key)}>
                                ×
                            </button>
                        </span>
                    ))}
                </div>
            ) : null}
            <input
                type="text"
                value={variantSearch}
                onChange={(e) => setVariantSearch(e.target.value)}
                className="w-full max-w-md rounded-lg border px-3 py-2 text-sm"
                placeholder="Введите объём, например: 100"
            />
            {searchError ? (
                <div className="text-xs text-red-600">{searchError}</div>
            ) : null}
            {variantSearch.trim() !== "" ? (
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border bg-white p-2">
                    {definitionsLoading ? (
                        <div className="px-2 py-2 text-xs text-admin-text-secondary">Поиск...</div>
                    ) : definitions.length === 0 ? (
                        <div className="px-2 py-2 text-xs text-admin-text-secondary">Ничего не найдено</div>
                    ) : (
                        definitions.map((item) => {
                            const count = countDefinitionInDraft(item, draftRows);
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => addDefinition(item)}
                                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm ${
                                        count > 0 ? "bg-admin-primary/10" : "hover:bg-admin-muted"
                                    }`}
                                >
                                    <span>{item.title}</span>
                                    <span className="shrink-0 text-xs text-admin-text-secondary">
                                        {count > 0 ? `×${count}` : "Добавить"}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            ) : (
                <div className="text-xs text-admin-text-secondary">
                    Наберите объём и нажимайте варианты. Один и тот же можно добавить несколько раз.
                </div>
            )}
        </div>
    );
}


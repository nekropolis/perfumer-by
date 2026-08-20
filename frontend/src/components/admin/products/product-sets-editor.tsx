"use client";

import { useEffect, useState } from "react";
import useDebouncedValue from "@/hooks/use-debounced-value";
import { type ProductSetAdminItem } from "@/lib/admin-products-api";
import {
    fetchVariantDefinitions,
    type VariantDefinitionItem,
} from "@/lib/admin-product-variants-api";
import { adminCheckbox } from "@/lib/admin-ui-classes";

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

export function draftFromDefinition(item: VariantDefinitionItem): ProductSetDraftRow | null {
    const volumeLabel =
        item.volume_ml != null
            ? formatVolumeLabel(item.volume_ml)
            : (item.volume_label || "").trim();
    const concentrationLabel = buildConcentrationLabel(item);
    if (!volumeLabel || !concentrationLabel) {
        return null;
    }

    return {
        key: `def-${item.id}`,
        volume_label: volumeLabel,
        concentration_label: concentrationLabel,
        title: item.title || `${volumeLabel} · ${concentrationLabel}`,
        definition_id: item.id,
    };
}

export function draftsFromSetComponents(
    components: ProductSetAdminItem["components"],
): ProductSetDraftRow[] {
    return components.map((row, index) => {
        const key =
            `${row.volume_label.trim().toLowerCase()}|${row.concentration_label.trim().toLowerCase()}` ||
            `row-${index}`;
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

function isDefinitionSelected(item: VariantDefinitionItem, draftRows: ProductSetDraftRow[]): boolean {
    const drafted = draftFromDefinition(item);
    if (!drafted) {
        return false;
    }

    return draftRows.some(
        (row) =>
            row.definition_id === item.id ||
            (row.volume_label === drafted.volume_label &&
                row.concentration_label === drafted.concentration_label),
    );
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

    const toggleDefinition = (item: VariantDefinitionItem) => {
        const next = draftFromDefinition(item);
        if (!next) return;

        if (isDefinitionSelected(item, draftRows)) {
            onChangeAction(
                draftRows.filter(
                    (row) =>
                        row.definition_id !== item.id &&
                        !(
                            row.volume_label === next.volume_label &&
                            row.concentration_label === next.concentration_label
                        ),
                ),
            );
            return;
        }

        onChangeAction([...draftRows, next]);
    };

    return (
        <div className="space-y-2">
            <label className="block text-sm text-admin-text-secondary">
                Состав набора — поиск по объёму, мультивыбор
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
                            const checked = isDefinitionSelected(item, draftRows);
                            return (
                                <label
                                    key={item.id}
                                    className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm ${
                                        checked ? "bg-admin-primary/10" : "hover:bg-admin-muted"
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        className={adminCheckbox}
                                        checked={checked}
                                        onChange={() => toggleDefinition(item)}
                                    />
                                    <span>{item.title}</span>
                                </label>
                            );
                        })
                    )}
                </div>
            ) : (
                <div className="text-xs text-admin-text-secondary">
                    Наберите объём, отметьте варианты галочками.
                </div>
            )}
        </div>
    );
}


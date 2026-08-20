import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { highlightAdminSearchTerms } from "@/lib/admin-search-highlight";
import type {
    SellerOneDuplicateVariantLinksResponse,
    SellerOneListingDiagnostics,
    SellerOneMatchRule,
    SellerOneParseDiagnostics,
    SellerOnePricingSettings,
} from "@/types/Vanille";
import {
    buildDefinitionSearchFromHint,
    findNameMatchHighlightRanges,
    findBrandPrefixHighlightRange,
    findGenderMarkerHighlightRange,
    mergeHighlightRanges,
    findEditionHighlightRanges,
    findSubsequenceHighlightRanges,
    formatCatalogProductLabel,
    formatParsedSupplierVariantHint,
    formatVariantOptionLabel,
    formatDefinitionOptionLabel,
    getConfidenceBadgeClass,
    getDefinitionMatchFlags,
    getVariantMatchFlags,
    getVariantMatchRowClass,
    hasVariantFlagMismatch,
    compareVariantMatchFlags,
    rankProducts,
    type ProductNameMatchInfo,
    type VariantMatchFlags,
} from "./utils";
import type { VariantDefinitionItem } from "@/lib/admin-product-variants-api";
import type { ProductAdminItem } from "@/lib/admin-products-api";
import type { ManualLinkState } from "./types";
import {
    adminBtnPrimary,
    adminBtnSecondary,
    adminInput,
    adminModalOverlay,
} from "@/lib/admin-ui-classes";

function usePortalMounted(): boolean {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return mounted;
}

function useBodyScrollLock(active: boolean): void {
    useEffect(() => {
        if (!active) {
            return;
        }
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [active]);
}

export function AlertMessage({
    message,
    onCloseAction,
}: {
    message: string;
    onCloseAction: () => void;
}) {
    return (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 whitespace-pre-wrap">{message}</div>
                <button type="button" onClick={onCloseAction} className="text-xs opacity-70 hover:opacity-100">
                    ✕
                </button>
            </div>
        </div>
    );
}

export function SuccessMessage({
    message,
    onCloseAction,
}: {
    message: string;
    onCloseAction: () => void;
}) {
    return (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1">{message}</div>
                <button type="button" onClick={onCloseAction} className="text-xs opacity-70 hover:opacity-100">
                    ✕
                </button>
            </div>
        </div>
    );
}

const LISTING_REASON_LABELS: Record<string, string> = {
    no_supplier_offer: "нет оффера поставщика",
    offer_inactive: "оффер неактивен",
    missing_in_latest_price: "кода нет в последнем прайсе",
    seller_one_listing_deferred: "витрина отложена до «Обновить цены»",
    out_of_stock_in_price_file: "нет в строке прайса",
    no_active_supplier_product_link: "нет активной связи supplier_product",
    listing_blocked_unknown: "неизвестная причина",
};

function formatListingReasons(reasons: string[] | undefined): string {
    if (!reasons?.length) {
        return "—";
    }
    return reasons.map((r) => LISTING_REASON_LABELS[r] ?? r).join("; ");
}

export function ParseDiagnosticsPanel({
    diagnostics,
    onCloseAction,
    onShowAllDuplicatesAction,
}: {
    diagnostics: SellerOneParseDiagnostics;
    onCloseAction: () => void;
    onShowAllDuplicatesAction?: () => void;
}) {
    const {
        linked_rows: linkedRows,
        distinct_linked_variants: distinctVariants,
        duplicate_variant_extra_rows: duplicateExtraRows,
        duplicate_variant_groups: duplicateGroups,
        duplicate_variant_samples: duplicateSamples,
        duplicate_file_code_extra_rows: fileCodeExtraRows,
        duplicate_file_code_samples: fileCodeSamples,
    } = diagnostics;

    const hasDuplicates = duplicateGroups > 0 || fileCodeExtraRows > 0;
    const hasVariantSpread = linkedRows > 0 && distinctVariants !== linkedRows;

    if (!hasDuplicates && !hasVariantSpread) {
        return (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="font-medium">Диагностика парсинга</div>
                        <p className="mt-1 text-xs text-green-900/80">
                            Дублей не найдено: {linkedRows} связок → {distinctVariants} уникальных variant_id.
                        </p>
                    </div>
                    <button type="button" onClick={onCloseAction} className="text-xs opacity-70 hover:opacity-100">
                        ✕
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-3">
                    <div className="font-medium">Диагностика парсинга: дубли связок</div>
                    <p className="text-xs text-amber-900/80">
                        Несколько кодов поставщика на один variant_id — лишние строки не попадут в счётчик «на витрине» при обновлении цен.
                    </p>
                    <dl className="grid gap-1 text-xs sm:grid-cols-2">
                        <div>
                            <dt className="text-amber-900/70">Связано строк</dt>
                            <dd className="font-mono">{linkedRows}</dd>
                        </div>
                        <div>
                            <dt className="text-amber-900/70">Уникальных variant_id</dt>
                            <dd className="font-mono">{distinctVariants}</dd>
                        </div>
                        <div>
                            <dt className="text-amber-900/70">Групп с 2+ кодами на variant</dt>
                            <dd className="font-mono">{duplicateGroups}</dd>
                        </div>
                        <div>
                            <dt className="text-amber-900/70">Лишних связок (дубли variant)</dt>
                            <dd className="font-mono">{duplicateExtraRows}</dd>
                        </div>
                        <div>
                            <dt className="text-amber-900/70">Повтор кода в файле (лишние строки)</dt>
                            <dd className="font-mono">{fileCodeExtraRows}</dd>
                        </div>
                    </dl>

                    {duplicateGroups > 0 && onShowAllDuplicatesAction ? (
                        <button
                            type="button"
                            onClick={onShowAllDuplicatesAction}
                            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-amber-100/80"
                        >
                            Полный список: {duplicateGroups} групп ({duplicateExtraRows} лишних кодов)
                        </button>
                    ) : null}

                    {duplicateSamples.length > 0 ? (
                        <div>
                            <div className="mb-1 text-xs font-medium">Примеры: несколько кодов → один variant_id</div>
                            <div className="overflow-x-auto rounded border border-amber-200/80 bg-white/60">
                                <table className="w-full min-w-[36rem] text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-amber-100 text-amber-900/70">
                                            <th className="px-2 py-1 font-medium">variant_id</th>
                                            <th className="px-2 py-1 font-medium">Коды</th>
                                            <th className="px-2 py-1 font-medium">Названия</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {duplicateSamples.map((row) => (
                                            <tr key={row.variant_id} className="border-b border-amber-50 last:border-0 align-top">
                                                <td className="px-2 py-1 font-mono">{row.variant_id}</td>
                                                <td className="px-2 py-1 font-mono whitespace-pre-wrap">{row.codes.join("\n")}</td>
                                                <td className="max-w-md px-2 py-1 whitespace-pre-wrap">{row.names.join("\n")}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : null}

                    {fileCodeSamples.length > 0 ? (
                        <div>
                            <div className="mb-1 text-xs font-medium">Примеры: повтор кода в файле</div>
                            <div className="overflow-x-auto rounded border border-amber-200/80 bg-white/60">
                                <table className="w-full min-w-[20rem] text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-amber-100 text-amber-900/70">
                                            <th className="px-2 py-1 font-medium">Код</th>
                                            <th className="px-2 py-1 font-medium">Строк в файле</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {fileCodeSamples.map((row) => (
                                            <tr key={row.code} className="border-b border-amber-50 last:border-0">
                                                <td className="px-2 py-1 font-mono">{row.code}</td>
                                                <td className="px-2 py-1 font-mono">{row.occurrences}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : null}
                </div>
                <button type="button" onClick={onCloseAction} className="text-xs opacity-70 hover:opacity-100">
                    ✕
                </button>
            </div>
        </div>
    );
}

export function ListingDiagnosticsPanel({
    diagnostics,
    onCloseAction,
    onShowAllDuplicatesAction,
}: {
    diagnostics: SellerOneListingDiagnostics;
    onCloseAction: () => void;
    onShowAllDuplicatesAction?: () => void;
}) {
    const {
        rows_updated: rowsUpdated,
        became_in_stock: becameInStock,
        in_stock_gap: inStockGap,
        gap_duplicate_variant: gapDuplicate,
        gap_already_listed: gapAlreadyListed,
        gap_not_listed: gapNotListed,
        gap_unexplained: gapUnexplained,
        distinct_variants_updated: distinctVariants,
        duplicate_variant_in_batch: duplicateCount,
        already_listed_before_batch: alreadyListedCount,
        not_listed_after_update: notListedCount,
        duplicate_variant_samples: duplicateSamples,
        already_listed_samples: alreadyListedSamples,
        not_listed_samples: notListedSamples,
    } = diagnostics;

    const gap = inStockGap ?? (rowsUpdated !== undefined && becameInStock !== undefined ? Math.max(0, rowsUpdated - becameInStock) : 0);
    const hasGap = gap > 0;
    const unexplained = gapUnexplained ?? 0;

    const hasSamples =
        duplicateSamples.length > 0 || alreadyListedSamples.length > 0 || notListedSamples.length > 0;
    const allClear = !hasGap && duplicateCount === 0 && alreadyListedCount === 0 && notListedCount === 0 && unexplained === 0;

    if (allClear && !hasSamples) {
        return (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="font-medium">Диагностика витрины</div>
                        <p className="mt-1 text-xs text-green-900/80">
                            Обработано {rowsUpdated ?? "—"}, появились на витрине {becameInStock ?? "—"} — расхождений нет.
                            Уникальных variant_id: {distinctVariants}.
                        </p>
                    </div>
                    <button type="button" onClick={onCloseAction} className="text-xs opacity-70 hover:opacity-100">
                        ✕
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={`rounded-lg border px-4 py-3 text-sm ${unexplained !== 0 ? "border-red-300 bg-red-50 text-red-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-3">
                    <div className="font-medium">Диагностика витрины после обновления цен</div>
                    <p className="text-xs opacity-80">
                        «Появились на витрине» — строки, у которых вариант стал доступен для продажи по прайсу (false→true).
                        Повторные коды на тот же variant_id сюда не входят. Снятие с витрины — только «пропали из прайса».
                    </p>

                    {hasGap ? (
                        <div className={`rounded border px-3 py-2 text-xs ${unexplained !== 0 ? "border-red-200 bg-white/70" : "border-amber-200/80 bg-white/60"}`}>
                            <div className="font-medium">
                                Разница: обработано {rowsUpdated ?? "—"} − на витрине {becameInStock ?? "—"} = {gap}
                            </div>
                            <ul className="mt-1 list-inside list-disc space-y-0.5 opacity-90">
                                <li>Повтор variant_id в прогоне: {gapDuplicate ?? duplicateCount}</li>
                                <li>Уже на витрине до строки: {gapAlreadyListed ?? alreadyListedCount}</li>
                                <li>Не вышли на витрину: {gapNotListed ?? notListedCount}</li>
                                {unexplained !== 0 ? (
                                    <li className="font-medium text-red-700">Неразобранный остаток (возможный баг): {unexplained}</li>
                                ) : null}
                            </ul>
                        </div>
                    ) : null}

                    {duplicateCount > 0 && onShowAllDuplicatesAction ? (
                        <button
                            type="button"
                            onClick={onShowAllDuplicatesAction}
                            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-amber-100/80"
                        >
                            Полный список дублей в базе (все коды на один variant_id)
                        </button>
                    ) : null}

                    <dl className="grid gap-1 text-xs sm:grid-cols-2">
                        <div>
                            <dt className="text-amber-900/70">Уникальных variant_id</dt>
                            <dd className="font-mono">{distinctVariants}</dd>
                        </div>
                        <div>
                            <dt className="text-amber-900/70">Повтор варианта (2+ кода → один variant_id)</dt>
                            <dd className="font-mono">{duplicateCount}</dd>
                        </div>
                        <div>
                            <dt className="text-amber-900/70">Уже на витрине до строки</dt>
                            <dd className="font-mono">{alreadyListedCount}</dd>
                        </div>
                        <div>
                            <dt className="text-amber-900/70">Не вышли на витрину</dt>
                            <dd className="font-mono">{notListedCount}</dd>
                        </div>
                    </dl>

                    {duplicateSamples.length > 0 ? (
                        <div>
                            <div className="mb-1 text-xs font-medium">Примеры: повтор variant_id (до {duplicateSamples.length})</div>
                            <div className="overflow-x-auto rounded border border-amber-200/80 bg-white/60">
                                <table className="w-full min-w-[32rem] text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-amber-100 text-amber-900/70">
                                            <th className="px-2 py-1 font-medium">Код</th>
                                            <th className="px-2 py-1 font-medium">variant_id</th>
                                            <th className="px-2 py-1 font-medium">Первый код в прогоне</th>
                                            <th className="px-2 py-1 font-medium">Название</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {duplicateSamples.map((row) => (
                                            <tr key={`${row.code}-${row.variant_id}`} className="border-b border-amber-50 last:border-0">
                                                <td className="px-2 py-1 font-mono">{row.code}</td>
                                                <td className="px-2 py-1 font-mono">{row.variant_id}</td>
                                                <td className="px-2 py-1 font-mono">{row.first_code ?? "—"}</td>
                                                <td className="max-w-xs truncate px-2 py-1" title={row.name}>{row.name ?? "—"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : null}

                    {notListedSamples.length > 0 ? (
                        <div>
                            <div className="mb-1 text-xs font-medium">Примеры: не на витрине (до {notListedSamples.length})</div>
                            <div className="overflow-x-auto rounded border border-amber-200/80 bg-white/60">
                                <table className="w-full min-w-[36rem] text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-amber-100 text-amber-900/70">
                                            <th className="px-2 py-1 font-medium">Код</th>
                                            <th className="px-2 py-1 font-medium">variant_id</th>
                                            <th className="px-2 py-1 font-medium">Причины</th>
                                            <th className="px-2 py-1 font-medium">Название</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {notListedSamples.map((row) => (
                                            <tr key={`${row.code}-${row.variant_id}-nl`} className="border-b border-amber-50 last:border-0">
                                                <td className="px-2 py-1 font-mono">{row.code}</td>
                                                <td className="px-2 py-1 font-mono">{row.variant_id}</td>
                                                <td className="px-2 py-1">{formatListingReasons(row.reasons)}</td>
                                                <td className="max-w-xs truncate px-2 py-1" title={row.name}>{row.name ?? "—"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : null}

                    {alreadyListedSamples.length > 0 ? (
                        <div>
                            <div className="mb-1 text-xs font-medium">Примеры: уже на витрине (до {alreadyListedSamples.length})</div>
                            <div className="overflow-x-auto rounded border border-amber-200/80 bg-white/60">
                                <table className="w-full min-w-[28rem] text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-amber-100 text-amber-900/70">
                                            <th className="px-2 py-1 font-medium">Код</th>
                                            <th className="px-2 py-1 font-medium">variant_id</th>
                                            <th className="px-2 py-1 font-medium">Название</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {alreadyListedSamples.map((row) => (
                                            <tr key={`${row.code}-${row.variant_id}-al`} className="border-b border-amber-50 last:border-0">
                                                <td className="px-2 py-1 font-mono">{row.code}</td>
                                                <td className="px-2 py-1 font-mono">{row.variant_id}</td>
                                                <td className="max-w-xs truncate px-2 py-1" title={row.name}>{row.name ?? "—"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : null}
                </div>
                <button type="button" onClick={onCloseAction} className="text-xs opacity-70 hover:opacity-100">
                    ✕
                </button>
            </div>
        </div>
    );
}

function classifyVariantLabelPart(part: string): "volume" | "tester" | "vial" | "miniature" | "concentration" {
    const normalized = part.trim().toLowerCase();
    // Не использовать \b после «мл»: в JS word-boundary — ASCII, кириллица ломает матч.
    if (/\d/.test(normalized) && /(мл|ml)/i.test(normalized)) {
        return "volume";
    }
    if (/^тестер$/i.test(normalized) || /^tester$/i.test(normalized)) {
        return "tester";
    }
    if (/^пробник$/i.test(normalized) || /^vial$/i.test(normalized)) {
        return "vial";
    }
    if (/^миниатюра$/i.test(normalized) || /^miniature$/i.test(normalized)) {
        return "miniature";
    }

    return "concentration";
}

function isVariantLabelPartMatched(part: string, flags: VariantMatchFlags): boolean {
    switch (classifyVariantLabelPart(part)) {
        case "volume":
            return flags.volume;
        case "concentration":
            return flags.concentration;
        case "tester":
            return flags.testerRelevant && flags.tester;
        case "vial":
            return flags.vialRelevant && flags.vial;
        case "miniature":
            return flags.miniatureRelevant && flags.miniature;
    }
}

/** Подсветка совпадений прямо в формулировке: «100 мл / EDT - … / Тестер». */
function HighlightedVariantMatchLabel({
    label,
    flags,
    inverted = false,
}: {
    label: string;
    flags: VariantMatchFlags;
    inverted?: boolean;
}) {
    const mismatch = hasVariantFlagMismatch(flags);
    const markClass = inverted
        ? "rounded-sm bg-white/25 px-0.5 font-semibold text-white"
        : mismatch
            ? "rounded-sm bg-admin-muted px-0.5 font-medium text-admin-text"
            : "rounded-sm bg-green-100/90 px-0.5 font-semibold text-green-900";

    const parts = label.split(/\s*\/\s*/).filter((part) => part.length > 0);
    if (parts.length <= 1) {
        const matched = parts[0] ? isVariantLabelPartMatched(parts[0], flags) : false;
        return matched ? <span className={markClass}>{label}</span> : <span>{label}</span>;
    }

    return (
        <span>
            {parts.map((part, index) => {
                const matched = isVariantLabelPartMatched(part, flags);

                return (
                    <span key={`${index}-${part}`}>
                        {index > 0 ? " / " : null}
                        {matched ? <span className={markClass}>{part}</span> : part}
                    </span>
                );
            })}
        </span>
    );
}

export function HighlightedNameText({
    text,
    matchInfo,
    className,
    highlightSource = "supplier",
}: {
    text: string;
    matchInfo?: ProductNameMatchInfo | null;
    className?: string;
    highlightSource?: "supplier" | "catalog";
}) {
    if (!text) {
        return null;
    }

    const words = highlightSource === "catalog"
        ? (matchInfo?.catalogWords ?? matchInfo?.words ?? [])
        : (matchInfo?.words ?? []);
    const brandForPrefix = highlightSource === "catalog"
        ? (matchInfo?.catalogBrandPrefix ?? null)
        : (matchInfo?.brandPrefix ?? null);

    if (words.length === 0 && !brandForPrefix && !matchInfo?.supplierGenderMarker && !matchInfo?.editionKeys?.length) {
        return <span className={className}>{text}</span>;
    }

    const markClass = matchInfo?.exact
        ? "rounded-sm bg-green-100 px-0.5 font-semibold text-green-900"
        : "rounded-sm bg-amber-100 px-0.5 font-semibold text-amber-900";

    let ranges: ReturnType<typeof findNameMatchHighlightRanges> = [];
    let searchFrom = 0;

    if (brandForPrefix) {
        const brandRange = findBrandPrefixHighlightRange(text, brandForPrefix);
        if (brandRange) {
            ranges.push(brandRange);
            searchFrom = brandRange.end;
        }
    }

    if (highlightSource === "supplier" && matchInfo?.supplierGenderMarker) {
        const genderRange = findGenderMarkerHighlightRange(text);
        if (genderRange) {
            ranges.push(genderRange);
        }
    }

    ranges = mergeHighlightRanges([
        ...ranges,
        ...findSubsequenceHighlightRanges(text, words, searchFrom),
        ...findEditionHighlightRanges(text, matchInfo?.editionKeys ?? [], searchFrom),
    ]);

    if (ranges.length === 0) {
        return <span className={className}>{text}</span>;
    }

    const parts: ReactNode[] = [];
    let cursor = 0;
    ranges.forEach((range, index) => {
        if (range.start > cursor) {
            parts.push(text.slice(cursor, range.start));
        }
        parts.push(
            <mark key={`${range.start}-${range.end}-${index}`} className={markClass}>
                {text.slice(range.start, range.end)}
            </mark>,
        );
        cursor = range.end;
    });
    if (cursor < text.length) {
        parts.push(text.slice(cursor));
    }

    return <span className={className}>{parts}</span>;
}

export function ConfidenceBadge({
    label,
    confidence,
}: {
    label: string;
    confidence: number;
}) {
    return (
        <span className={`rounded-full px-2 py-1 text-xs ${getConfidenceBadgeClass(confidence)}`}>
            {label} ({confidence}%)
        </span>
    );
}

export function ManualLinkModal({
    manualLink,
    isProductSearchDebouncing = false,
    linkingRowId,
    setManualLink,
    onCloseAction,
    onPickProductAction,
    onPickVariantAction,
    onPickDefinitionAction,
    onConfirmAction,
}: {
    manualLink: ManualLinkState;
    isProductSearchDebouncing?: boolean;
    linkingRowId: number | null;
    setManualLink: Dispatch<SetStateAction<ManualLinkState | null>>;
    onCloseAction: () => void;
    onPickProductAction: (product: ProductAdminItem) => Promise<void>;
    onPickVariantAction: (variantId: number) => void;
    onPickDefinitionAction: (definitionId: number) => Promise<void>;
    onConfirmAction: (rowId: number, variantId: number) => Promise<void>;
}) {
    const mounted = usePortalMounted();
    useBodyScrollLock(true);

    const selectedProduct = manualLink.products.find((p) => p.id === manualLink.selectedProductId);
    const selectedProductLabel = selectedProduct ? formatCatalogProductLabel(selectedProduct) : "";

    const productQuery = manualLink.productSearch.trim();
    const showProductSearchStatus =
        manualLink.selectedProductId === null
        && productQuery.length >= 2
        && (manualLink.productsLoading || isProductSearchDebouncing);

    const showProductDropdown =
        manualLink.selectedProductId === null
        && manualLink.products.length > 0
        && productQuery.length >= 2;

    const showProductEmptyState =
        manualLink.selectedProductId === null
        && !manualLink.productsLoading
        && !isProductSearchDebouncing
        && productQuery.length >= 2
        && manualLink.products.length === 0;

    const rankedProducts = rankProducts(manualLink.products, manualLink.productSearch);

    const sortedVariants = [...manualLink.variants].sort((a, b) => {
        const flagsA = getVariantMatchFlags(a, manualLink.sourceHint);
        const flagsB = getVariantMatchFlags(b, manualLink.sourceHint);
        return compareVariantMatchFlags(flagsA, flagsB) || a.id - b.id;
    });

    const sortedDefinitions = [...manualLink.definitions].sort((a, b) => {
        const flagsA = getDefinitionMatchFlags(a, manualLink.sourceHint);
        const flagsB = getDefinitionMatchFlags(b, manualLink.sourceHint);
        return compareVariantMatchFlags(flagsA, flagsB) || a.id - b.id;
    });

    const handleProductSearchChange = (value: string) => {
        setManualLink((prev) => {
            if (!prev) {
                return prev;
            }

            const clearingSelection =
                prev.selectedProductId !== null && value.trim() !== selectedProductLabel.trim();

            return {
                ...prev,
                productSearch: value,
                ...(clearingSelection
                    ? {
                        selectedProductId: null,
                        selectedVariantId: null,
                        variants: [],
                        variantsLoading: false,
                        definitions: [],
                        definitionSearch: buildDefinitionSearchFromHint(prev.sourceHint),
                        definitionsLoading: false,
                    }
                    : {}),
            };
        });
    };

    if (!mounted) {
        return null;
    }

    return createPortal(
        <div className={adminModalOverlay}>
            <div className="flex max-h-[min(92dvh,100%)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-admin-border bg-admin-surface shadow-2xl sm:max-h-[min(88dvh,760px)] sm:rounded-xl">
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-admin-border px-4 py-3 sm:px-5 sm:py-4">
                    <div className="min-w-0">
                        <div className="text-base font-semibold text-admin-text">Принудительная связка</div>
                        <div className="mt-0.5 truncate text-sm text-admin-text-secondary" title={manualLink.rowName}>
                            {manualLink.rowName}
                        </div>
                    </div>
                    <button type="button" onClick={onCloseAction} className={`${adminBtnSecondary} shrink-0`}>
                        Закрыть
                    </button>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-admin-text-secondary">
                            Локальный товар
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                value={manualLink.productSearch}
                                onChange={(e) => handleProductSearchChange(e.target.value)}
                                className={adminInput}
                                placeholder="Бренд, название…"
                            />
                            {showProductSearchStatus ? (
                                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-admin-text-muted">
                                    …
                                </span>
                            ) : null}
                        </div>
                        {showProductEmptyState ? (
                            <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                Товары не найдены. Попробуй упростить запрос.
                            </div>
                        ) : null}
                        {showProductDropdown ? (
                            <div
                                className={`mt-1.5 max-h-52 overflow-y-auto rounded-lg border border-admin-border bg-admin-surface p-1 shadow-sm ${manualLink.productsLoading || isProductSearchDebouncing ? "opacity-70" : ""}`}
                            >
                                {rankedProducts.map((product) => {
                                    const label = formatCatalogProductLabel(product);
                                    const selected = product.id === manualLink.selectedProductId;

                                    return (
                                        <button
                                            key={product.id}
                                            type="button"
                                            onClick={() => void onPickProductAction(product)}
                                            className={`block min-h-9 w-full rounded-md px-3 py-1.5 text-left text-sm transition ${
                                                selected
                                                    ? "bg-admin-primary text-white"
                                                    : "text-admin-text hover:bg-admin-muted"
                                            }`}
                                        >
                                            {selected
                                                ? label
                                                : highlightAdminSearchTerms(
                                                    label,
                                                    productQuery,
                                                    product.brand?.name ?? null,
                                                )}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>

                    {manualLink.selectedProductId ? (
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                                <label className="text-sm font-medium text-admin-text-secondary">
                                    Формулировка
                                </label>
                                {(manualLink.sourceHint.volume
                                    || manualLink.sourceHint.volumeIsMultipack
                                    || manualLink.sourceHint.concentration
                                    || manualLink.sourceHint.isTester) ? (
                                    <div className="text-[11px] text-admin-text-muted">
                                        Из прайса:{" "}
                                        <span className="font-medium text-admin-text-secondary">
                                            {formatParsedSupplierVariantHint({
                                                volume: manualLink.sourceHint.volume,
                                                volume_is_multipack: manualLink.sourceHint.volumeIsMultipack,
                                                volume_multipack_count: manualLink.sourceHint.volumeMultipackCount,
                                                volume_multipack_unit_ml: manualLink.sourceHint.volumeMultipackUnitMl,
                                                concentration: manualLink.sourceHint.concentration,
                                                is_tester: manualLink.sourceHint.isTester,
                                                is_vial: manualLink.sourceHint.isVial,
                                                is_miniature: manualLink.sourceHint.isMiniature,
                                            })}
                                        </span>
                                    </div>
                                ) : null}
                            </div>
                            <input
                                type="text"
                                value={manualLink.definitionSearch}
                                onChange={(e) =>
                                    setManualLink((prev) =>
                                        prev ? { ...prev, definitionSearch: e.target.value } : prev
                                    )
                                }
                                className={adminInput}
                                placeholder="Объём, концентрация или часть названия"
                            />
                            {manualLink.variantsLoading ? (
                                <div className="text-xs text-admin-text-muted">Загрузка вариантов…</div>
                            ) : null}
                            {!manualLink.variantsLoading && sortedVariants.length > 0 ? (
                                <div>
                                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-admin-text-secondary">
                                        Варианты товара
                                    </div>
                                    <div className="max-h-56 overflow-y-auto rounded-lg border border-admin-border bg-admin-surface">
                                        {sortedVariants.map((variant) => {
                                            const flags = getVariantMatchFlags(variant, manualLink.sourceHint);
                                            const selected = manualLink.selectedVariantId === variant.id;
                                            const label = formatVariantOptionLabel(variant);

                                            return (
                                                <button
                                                    key={variant.id}
                                                    type="button"
                                                    onClick={() => onPickVariantAction(variant.id)}
                                                    className={`block w-full border-b border-admin-border/70 px-3 py-1.5 text-left text-sm last:border-b-0 transition-colors ${getVariantMatchRowClass(flags, selected)}`}
                                                >
                                                    <HighlightedVariantMatchLabel
                                                        label={label}
                                                        flags={flags}
                                                        inverted={selected}
                                                    />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : null}
                            {!manualLink.variantsLoading
                                && sortedVariants.length === 0
                                && manualLink.definitionSearch.trim() === "" ? (
                                <div className="text-[11px] text-admin-text-muted">
                                    У товара пока нет вариантов — введи формулировку ниже.
                                </div>
                            ) : null}
                            {manualLink.definitionsLoading ? (
                                <div className="text-xs text-admin-text-muted">Поиск в справочнике…</div>
                            ) : null}
                            {!manualLink.definitionsLoading
                                && !manualLink.variantsLoading
                                && manualLink.definitionSearch.trim() !== ""
                                && sortedDefinitions.length === 0
                                && sortedVariants.length === 0 ? (
                                <div className="text-xs text-amber-700">В справочнике ничего не найдено.</div>
                            ) : null}
                            {sortedDefinitions.length > 0 ? (
                                <div>
                                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-admin-text-secondary">
                                        Справочник
                                        <span className="ml-1 font-normal normal-case tracking-normal text-admin-text-muted">
                                            — клик добавит к товару
                                        </span>
                                    </div>
                                    <div className="max-h-56 overflow-y-auto rounded-lg border border-admin-border bg-admin-surface">
                                        {sortedDefinitions.map((def: VariantDefinitionItem) => {
                                            const flags = getDefinitionMatchFlags(def, manualLink.sourceHint);

                                            return (
                                                <button
                                                    key={def.id}
                                                    type="button"
                                                    disabled={manualLink.attachingDefinition}
                                                    onClick={() => void onPickDefinitionAction(def.id)}
                                                    className={`block w-full border-b border-admin-border/70 px-3 py-1.5 text-left text-sm last:border-b-0 transition-colors disabled:opacity-50 ${getVariantMatchRowClass(flags, false)}`}
                                                >
                                                    <HighlightedVariantMatchLabel
                                                        label={formatDefinitionOptionLabel(def)}
                                                        flags={flags}
                                                    />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : null}
                            <p className="text-[11px] text-admin-text-muted">
                                Если формулировка уже есть у товара, дубликат не создаётся — будет выбран
                                существующий вариант.
                            </p>
                        </div>
                    ) : null}
                </div>

                {manualLink.selectedVariantId ? (
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-admin-border bg-admin-bg/60 px-4 py-3 sm:px-5">
                        <div className="min-w-0">
                            <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-admin-text-secondary">
                                К связке
                            </div>
                            <div className="truncate text-sm font-medium text-admin-text">
                                {(() => {
                                    const v = manualLink.variants.find((x) => x.id === manualLink.selectedVariantId);
                                    return v
                                        ? formatVariantOptionLabel(v)
                                        : `Вариант #${manualLink.selectedVariantId}`;
                                })()}
                            </div>
                        </div>
                        <button
                            type="button"
                            disabled={linkingRowId === manualLink.rowId}
                            onClick={() =>
                                void onConfirmAction(manualLink.rowId, manualLink.selectedVariantId!)
                            }
                            className={adminBtnPrimary}
                        >
                            Связать
                        </button>
                    </div>
                ) : null}
            </div>
        </div>,
        document.body,
    );
}

export function RulesModal({
    open,
    rules,
    rulePattern,
    ruleReplacement,
    ruleSupplierCode = "edp",
    rulesFilterSupplier = "",
    ruleSaving,
    onCloseAction,
    onPatternChangeAction,
    onReplacementChangeAction,
    onSupplierChangeAction,
    onFilterSupplierChangeAction,
    onCreateAction,
    onToggleRuleAction,
    onDeleteRuleAction,
}: {
    open: boolean;
    rules: SellerOneMatchRule[];
    rulePattern: string;
    ruleReplacement: string;
    ruleSupplierCode?: string;
    rulesFilterSupplier?: string;
    ruleSaving: boolean;
    onCloseAction: () => void;
    onPatternChangeAction: (value: string) => void;
    onReplacementChangeAction: (value: string) => void;
    onSupplierChangeAction?: (value: "edp" | "lagdos") => void;
    onFilterSupplierChangeAction?: (value: "" | "edp" | "lagdos") => void | Promise<void>;
    onCreateAction: () => Promise<void>;
    onToggleRuleAction: (rule: SellerOneMatchRule) => Promise<void>;
    onDeleteRuleAction: (rule: SellerOneMatchRule) => Promise<void>;
}) {
    const mounted = usePortalMounted();
    useBodyScrollLock(open);

    if (!open || !mounted) {
        return null;
    }

    return createPortal(
        <div className="fixed inset-0 z-[200] bg-slate-900/50 px-4 py-6">
            <div className="mx-auto flex h-full w-full max-w-2xl items-center justify-center">
                <div className="flex max-h-full w-full flex-col rounded-2xl bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b px-5 py-4">
                        <h2 className="text-lg font-semibold">Правила поиска</h2>
                        <button type="button" onClick={onCloseAction} className="text-sm text-admin-text-secondary">
                            Закрыть
                        </button>
                    </div>
                    <div className="space-y-4 overflow-y-auto px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="text-xs text-admin-text-secondary">Фильтр:</label>
                            <select
                                value={rulesFilterSupplier}
                                onChange={(e) => {
                                    void onFilterSupplierChangeAction?.(e.target.value as "" | "edp" | "lagdos");
                                }}
                                className="rounded-lg border px-2 py-1.5 text-sm"
                            >
                                <option value="">Все поставщики</option>
                                <option value="edp">EDP</option>
                                <option value="lagdos">Lagdos</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
                            <input
                                value={rulePattern}
                                onChange={(e) => onPatternChangeAction(e.target.value)}
                                placeholder="pattern, например A.Banderas"
                                className="rounded-lg border px-3 py-2 text-sm"
                            />
                            <input
                                value={ruleReplacement}
                                onChange={(e) => onReplacementChangeAction(e.target.value)}
                                placeholder="replacement, например Antonio Banderas"
                                className="rounded-lg border px-3 py-2 text-sm"
                            />
                            <select
                                value={ruleSupplierCode}
                                onChange={(e) => onSupplierChangeAction?.(e.target.value as "edp" | "lagdos")}
                                className="rounded-lg border px-2 py-2 text-sm"
                            >
                                <option value="edp">EDP</option>
                                <option value="lagdos">Lagdos</option>
                            </select>
                            <button
                                type="button"
                                onClick={() => void onCreateAction()}
                                disabled={ruleSaving}
                                className="rounded-lg bg-admin-primary px-3 py-2 text-sm text-white disabled:opacity-50"
                            >
                                {ruleSaving ? "..." : "Добавить"}
                            </button>
                        </div>
                        <div className="space-y-2">
                            {rules.map((rule) => (
                                <div
                                    key={rule.id}
                                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                                >
                                    <div className="min-w-0">
                                        <div className="font-medium">
                                            {rule.pattern} {"->"} {rule.replacement}
                                        </div>
                                        <div className="text-xs text-admin-text-secondary">
                                            {rule.supplier?.name ?? `supplier #${rule.supplier_id}`}
                                            {" / "}
                                            sort: {rule.sort_order} / {rule.is_active ? "active" : "off"}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void onToggleRuleAction(rule)}
                                            className="rounded-lg border px-2 py-1 text-xs"
                                        >
                                            On/Off
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void onDeleteRuleAction(rule)}
                                            className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600"
                                        >
                                            Удалить
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}

export function PricingSettingsModal({
    open,
    form,
    saving,
    onCloseAction,
    onChangeAction,
    onSaveAction,
}: {
    open: boolean;
    form: SellerOnePricingSettings;
    saving: boolean;
    onCloseAction: () => void;
    onChangeAction: (field: keyof SellerOnePricingSettings, value: number) => void;
    onSaveAction: () => Promise<void>;
}) {
    const mounted = usePortalMounted();
    useBodyScrollLock(open);

    if (!open || !mounted) {
        return null;
    }

    return createPortal(
        <div className="fixed inset-0 z-[200] bg-slate-900/50 px-4 py-6">
            <div className="mx-auto flex h-full w-full max-w-2xl items-center justify-center">
                <div className="flex max-h-full w-full flex-col rounded-2xl bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b px-5 py-4">
                        <h2 className="text-lg font-semibold">Формула цены Seller One</h2>
                        <button type="button" onClick={onCloseAction} className="text-sm text-admin-text-secondary">
                            Закрыть
                        </button>
                    </div>
                    <div className="space-y-4 overflow-y-auto px-5 py-4">
                        <div className="rounded-lg border bg-admin-muted px-3 py-2 text-xs text-admin-text-secondary">
                            C = цена прайса, Цена=ОКРУГЛ((C*1,28+7)*3,15;0)
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <label className="space-y-1 text-sm">
                                <span className="text-admin-text-secondary">Коэффициент на умножение (1.28)</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={form.price_markup}
                                    onChange={(e) => onChangeAction("price_markup", Number(e.target.value))}
                                    className="w-full rounded-lg border px-3 py-2 text-sm"
                                />
                            </label>
                            <div className="space-y-1 text-sm">
                                <span className="block text-admin-text-secondary">Курс BYN</span>
                                <div className="rounded-lg border bg-admin-muted px-3 py-2 tabular-nums text-admin-text">
                                    {form.price_rate}р
                                </div>
                            </div>
                            <label className="space-y-1 text-sm">
                                <span className="text-admin-text-secondary">Коэффициент на сложение</span>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={form.price_fixed_fee}
                                    onChange={(e) => onChangeAction("price_fixed_fee", Number(e.target.value))}
                                    className="w-full rounded-lg border px-3 py-2 text-sm"
                                />
                            </label>
                            <label className="space-y-1 text-sm">
                                <span className="text-admin-text-secondary">Округление до (1)</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={4}
                                    value={form.price_precision}
                                    onChange={(e) => onChangeAction("price_precision", Number(e.target.value))}
                                    className="w-full rounded-lg border px-3 py-2 text-sm"
                                />
                            </label>
                        </div>
                        <button
                            type="button"
                            onClick={() => void onSaveAction()}
                            disabled={saving}
                            className="rounded-lg bg-admin-primary px-4 py-2 text-sm text-white shadow-sm transition hover:bg-admin-primary-hover disabled:opacity-50"
                        >
                            {saving ? "Сохраняю..." : "Сохранить формулу"}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}

export function DuplicateVariantLinksModal({
    data,
    loading,
    error,
    onCloseAction,
}: {
    data: SellerOneDuplicateVariantLinksResponse | null;
    loading: boolean;
    error: string;
    onCloseAction: () => void;
}) {
    const open = loading || Boolean(error) || Boolean(data);
    const mounted = usePortalMounted();
    useBodyScrollLock(open);

    if (!open || !mounted) {
        return null;
    }

    const rows = (data?.groups ?? []).flatMap((group) =>
        group.entries.map((entry, index) => ({
            key: `${group.variant_id}-${entry.code}-${entry.supplier_product_id}`,
            variant_id: group.variant_id,
            isFirstInGroup: index === 0,
            groupSize: group.entries.length,
            code: entry.code,
            name: entry.name,
            supplier_product_id: entry.supplier_product_id,
        })),
    );

    return createPortal(
        <div className="fixed inset-0 z-[200] bg-slate-900/50 px-4 py-6" onClick={onCloseAction}>
            <div
                className="mx-auto flex h-full w-full max-w-5xl items-center justify-center"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex max-h-full min-h-0 w-full flex-col rounded-2xl bg-white shadow-xl">
                    <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
                        <div>
                            <div className="text-sm font-medium">Дубли: несколько кодов → один variant_id</div>
                            {data ? (
                                <p className="mt-1 text-xs text-admin-text-secondary">
                                    {data.duplicate_variant_groups} групп, {data.duplicate_variant_extra_rows} лишних
                                    связок, всего связано {data.linked_rows} → {data.distinct_linked_variants} variant_id
                                </p>
                            ) : null}
                        </div>
                        <button type="button" onClick={onCloseAction} className="text-xs text-admin-text-secondary">
                            Закрыть
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                        {loading ? (
                            <p className="text-sm text-admin-text-secondary">Загрузка…</p>
                        ) : null}
                        {error ? (
                            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                        ) : null}
                        {!loading && !error && rows.length === 0 ? (
                            <p className="text-sm text-green-700">Дублей нет: у каждого variant_id не больше одного кода.</p>
                        ) : null}
                        {!loading && !error && rows.length > 0 ? (
                            <div className="overflow-x-auto rounded-xl border">
                                <table className="w-full min-w-[40rem] text-left text-xs">
                                    <thead>
                                        <tr className="border-b bg-admin-muted text-admin-text-secondary">
                                            <th className="px-2 py-2 font-medium">variant_id</th>
                                            <th className="px-2 py-2 font-medium">Кодов в группе</th>
                                            <th className="px-2 py-2 font-medium">Код</th>
                                            <th className="px-2 py-2 font-medium">Строка #</th>
                                            <th className="px-2 py-2 font-medium">Название поставщика</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row) => (
                                            <tr key={row.key} className="border-b border-admin-border/60 last:border-0 align-top">
                                                <td className="px-2 py-1.5 font-mono">{row.variant_id}</td>
                                                <td className="px-2 py-1.5 font-mono">{row.isFirstInGroup ? row.groupSize : ""}</td>
                                                <td className="px-2 py-1.5 font-mono">{row.code}</td>
                                                <td className="px-2 py-1.5 font-mono">{row.supplier_product_id}</td>
                                                <td className="max-w-md px-2 py-1.5" title={row.name}>{row.name}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}

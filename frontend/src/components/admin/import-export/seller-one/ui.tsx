"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { SellerOneMatchRule, SellerOnePricingSettings } from "@/types/Vanille";
import {
    buildDefinitionSearchFromHint,
    buildSupplierLabelFromHint,
    findNameMatchHighlightRanges,
    formatCatalogProductLabel,
    formatVariantOptionLabel,
    findProductNameMatchInfo,
    getConfidenceBadgeClass,
    definitionMatchesVolumeHint,
    getDefinitionMatchFlags,
    getVariantMatchFlags,
    getVariantMatchRowClass,
    isFullVariantMatch,
    rankProducts,
    variantMatchesVolumeHint,
    type ProductNameMatchInfo,
    type VariantMatchFlags,
} from "./utils";
import type { VariantDefinitionItem } from "@/lib/admin-product-variants-api";
import type { ProductAdminItem } from "@/lib/admin-products-api";
import type { ManualLinkState } from "./types";

export function AlertMessage({
    message,
    onCloseAction,
}: {
    message: string;
    onCloseAction: () => void;
}) {
    return (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1">{message}</div>
                <button type="button" onClick={onCloseAction} className="text-xs opacity-70 hover:opacity-100">
                    ✕
                </button>
            </div>
        </div>
    );
}

function VariantMatchBadges({
    flags,
    inverted = false,
}: {
    flags: VariantMatchFlags;
    inverted?: boolean;
}) {
    const okClass = inverted ? "bg-white/20 text-white" : "bg-green-100 text-green-700";
    const missClass = inverted ? "bg-white/10 text-white/70" : "bg-gray-100 text-gray-500";
    const partialClass = inverted ? "bg-white/15 text-white" : "bg-amber-100 text-amber-800";

    const badge = (label: string, matched: boolean) => (
        <span
            key={label}
            className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${matched ? okClass : missClass}`}
        >
            {label}
            {matched ? " ✓" : ""}
        </span>
    );

    return (
        <div className="mt-1 flex flex-wrap gap-1">
            {badge("Объём", flags.volume)}
            {badge("Конц.", flags.concentration)}
            {flags.testerRelevant ? badge("Тестер", flags.tester) : null}
            {isFullVariantMatch(flags) ? (
                <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${partialClass}`}>
                    Полное совпадение
                </span>
            ) : null}
        </div>
    );
}

export function HighlightedNameText({
    text,
    matchInfo,
    className,
}: {
    text: string;
    matchInfo?: ProductNameMatchInfo | null;
    className?: string;
}) {
    if (!text) {
        return null;
    }

    const words = matchInfo?.words ?? [];
    if (words.length === 0) {
        return <span className={className}>{text}</span>;
    }

    const ranges = findNameMatchHighlightRanges(text, words, matchInfo?.exact ?? false);
    if (ranges.length === 0) {
        return <span className={className}>{text}</span>;
    }

    const markClass = matchInfo?.exact
        ? "rounded-sm bg-green-100 px-0.5 font-semibold text-green-900"
        : "rounded-sm bg-amber-100 px-0.5 font-semibold text-amber-900";

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
    const supplierLabel = buildSupplierLabelFromHint(manualLink.sourceHint) || manualLink.rowName;

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

    const variantsForHint = manualLink.variants.filter((variant) =>
        variantMatchesVolumeHint(variant, manualLink.sourceHint),
    );

    const sortedVariants = [...variantsForHint].sort((a, b) => {
        const scoreA = getVariantMatchFlags(a, manualLink.sourceHint).score;
        const scoreB = getVariantMatchFlags(b, manualLink.sourceHint).score;
        return scoreB - scoreA || a.id - b.id;
    });

    const definitionsForHint = manualLink.definitions.filter((definition) =>
        definitionMatchesVolumeHint(definition, manualLink.sourceHint),
    );

    const sortedDefinitions = [...definitionsForHint].sort((a, b) => {
        const scoreA = getDefinitionMatchFlags(a, manualLink.sourceHint).score;
        const scoreB = getDefinitionMatchFlags(b, manualLink.sourceHint).score;
        return scoreB - scoreA || a.id - b.id;
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

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/50 px-4 py-6">
            <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center">
                <div className="flex max-h-full min-h-0 w-full flex-col rounded-2xl bg-white shadow-xl">
                    <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
                        <div className="text-sm font-medium">
                            Принудительная связка для товара: <strong>{manualLink.rowName}</strong>
                        </div>
                        <button type="button" onClick={onCloseAction} className="text-xs text-admin-text-secondary">
                            Закрыть
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-admin-text-secondary">
                                Локальный товар (поиск по мере ввода)
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={manualLink.productSearch}
                                    onChange={(e) => handleProductSearchChange(e.target.value)}
                                    className="w-full rounded-xl border px-3 py-2 text-sm"
                                    placeholder="Бренд, название…"
                                />
                                {showProductSearchStatus ? (
                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-admin-text-secondary">
                                        …
                                    </span>
                                ) : null}
                            </div>
                            <div className="mt-1 min-h-8">
                                {showProductEmptyState ? (
                                    <div className="rounded-xl border bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                        Товары не найдены. Попробуй упростить запрос.
                                    </div>
                                ) : null}
                                {showProductDropdown ? (
                                    <div
                                        className={`max-h-64 overflow-y-auto rounded-xl border bg-white p-1 shadow-sm ${manualLink.productsLoading || isProductSearchDebouncing ? "opacity-70" : ""}`}
                                    >
                                    {rankedProducts.map((product) => {
                                        const label = formatCatalogProductLabel(product);
                                        const matchInfo = findProductNameMatchInfo(supplierLabel, label);

                                        return (
                                            <button
                                                key={product.id}
                                                type="button"
                                                onClick={() => void onPickProductAction(product)}
                                                className="w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-admin-muted"
                                            >
                                                <HighlightedNameText
                                                    text={label}
                                                    matchInfo={matchInfo}
                                                    className="font-medium"
                                                />
                                            </button>
                                        );
                                    })}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {manualLink.selectedProductId ? (
                            <div className="space-y-2 rounded-xl border border-dashed border-admin-border bg-admin-muted/80 p-3">
                                <div className="text-xs font-medium text-admin-text">
                                    Формулировка (поиск по мере ввода, нажми строку — добавится к товару)
                                </div>
                                {(manualLink.sourceHint.volume || manualLink.sourceHint.concentration) ? (
                                    <div className="text-[11px] text-admin-text-secondary">
                                        Из прайса:{" "}
                                        {manualLink.sourceHint.volume != null ? `${manualLink.sourceHint.volume} ml` : "—"}
                                        {manualLink.sourceHint.concentration
                                            ? ` / ${manualLink.sourceHint.concentration.toUpperCase()}`
                                            : ""}
                                        {manualLink.sourceHint.isTester ? " / TESTER" : ""}
                                    </div>
                                ) : null}
                                <input
                                    type="text"
                                    value={manualLink.definitionSearch}
                                    onChange={(e) =>
                                        setManualLink((prev) =>
                                            prev ? { ...prev, definitionSearch: e.target.value } : prev
                                        )
                                    }
                                    className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
                                    placeholder="Объём, концентрация или часть названия"
                                />
                                {manualLink.variantsLoading ? (
                                    <div className="text-xs text-admin-text-secondary">Загрузка вариантов…</div>
                                ) : null}
                                {!manualLink.variantsLoading && sortedVariants.length > 0 ? (
                                    <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border bg-white p-1">
                                        {sortedVariants.map((variant) => {
                                            const flags = getVariantMatchFlags(variant, manualLink.sourceHint);
                                            const selected = manualLink.selectedVariantId === variant.id;

                                            return (
                                                <button
                                                    key={variant.id}
                                                    type="button"
                                                    onClick={() => onPickVariantAction(variant.id)}
                                                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${getVariantMatchRowClass(flags, selected)}`}
                                                >
                                                    <div>{formatVariantOptionLabel(variant)}</div>
                                                    <VariantMatchBadges flags={flags} inverted={selected} />
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : null}
                                {!manualLink.variantsLoading
                                    && sortedVariants.length === 0
                                    && manualLink.definitionSearch.trim() === "" ? (
                                    <div className="text-[11px] text-admin-text-secondary">
                                        {manualLink.sourceHint.volume != null
                                            && manualLink.variants.length > 0
                                            ? `Нет вариантов с объёмом ${manualLink.sourceHint.volume} ml — найди формулировку в справочнике ниже.`
                                            : "У товара пока нет вариантов — введи формулировку ниже."}
                                    </div>
                                ) : null}
                                {manualLink.definitionsLoading ? (
                                    <div className="text-xs text-admin-text-secondary">Поиск в справочнике…</div>
                                ) : null}
                                {!manualLink.definitionsLoading
                                    && !manualLink.variantsLoading
                                    && manualLink.definitionSearch.trim() !== ""
                                    && sortedDefinitions.length === 0 ? (
                                    <div className="text-xs text-amber-700">В справочнике ничего не найдено.</div>
                                ) : null}
                                {sortedDefinitions.length > 0 ? (
                                    <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border bg-white p-1">
                                        {sortedDefinitions.map((def: VariantDefinitionItem) => {
                                            const flags = getDefinitionMatchFlags(def, manualLink.sourceHint);

                                            return (
                                                <button
                                                    key={def.id}
                                                    type="button"
                                                    disabled={manualLink.attachingDefinition}
                                                    onClick={() => void onPickDefinitionAction(def.id)}
                                                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${getVariantMatchRowClass(flags, false)}`}
                                                >
                                                    <div>{def.title}</div>
                                                    <VariantMatchBadges flags={flags} />
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : null}
                                <p className="text-[11px] text-admin-text-secondary">
                                    Если формулировка уже есть у товара, дубликат не создаётся — будет выбран
                                    существующий вариант.
                                </p>
                            </div>
                        ) : null}

                        {manualLink.selectedVariantId ? (
                            <div className="space-y-2 rounded-xl border border-green-200 bg-green-50/60 p-3">
                                <div className="text-xs font-medium text-green-900">Готово к связке</div>
                                <div className="text-sm text-green-900">
                                    {(() => {
                                        const v = manualLink.variants.find((x) => x.id === manualLink.selectedVariantId);
                                        return v
                                            ? formatVariantOptionLabel(v)
                                            : `Вариант #${manualLink.selectedVariantId}`;
                                    })()}
                                </div>
                                <button
                                    type="button"
                                    disabled={linkingRowId === manualLink.rowId}
                                    onClick={() =>
                                        void onConfirmAction(manualLink.rowId, manualLink.selectedVariantId!)
                                    }
                                    className="rounded-full bg-admin-primary px-4 py-2 text-sm text-white shadow-sm transition hover:bg-admin-primary-hover disabled:opacity-50"
                                >
                                    Связать со строкой прайса
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function RulesModal({
    open,
    rules,
    rulePattern,
    ruleReplacement,
    ruleSaving,
    onCloseAction,
    onPatternChangeAction,
    onReplacementChangeAction,
    onCreateAction,
    onToggleRuleAction,
    onDeleteRuleAction,
}: {
    open: boolean;
    rules: SellerOneMatchRule[];
    rulePattern: string;
    ruleReplacement: string;
    ruleSaving: boolean;
    onCloseAction: () => void;
    onPatternChangeAction: (value: string) => void;
    onReplacementChangeAction: (value: string) => void;
    onCreateAction: () => Promise<void>;
    onToggleRuleAction: (rule: SellerOneMatchRule) => Promise<void>;
    onDeleteRuleAction: (rule: SellerOneMatchRule) => Promise<void>;
}) {
    if (!open) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/50 px-4 py-6">
            <div className="mx-auto flex h-full w-full max-w-2xl items-center justify-center">
                <div className="flex max-h-full w-full flex-col rounded-2xl bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b px-5 py-4">
                        <h2 className="text-lg font-semibold">Правила поиска Seller One</h2>
                        <button type="button" onClick={onCloseAction} className="text-sm text-admin-text-secondary">
                            Закрыть
                        </button>
                    </div>
                    <div className="space-y-4 overflow-y-auto px-5 py-4">
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                            <input
                                value={rulePattern}
                                onChange={(e) => onPatternChangeAction(e.target.value)}
                                placeholder="pattern, например A.Banderas"
                                className="rounded-xl border px-3 py-2 text-sm"
                            />
                            <input
                                value={ruleReplacement}
                                onChange={(e) => onReplacementChangeAction(e.target.value)}
                                placeholder="replacement, например Antonio Banderas"
                                className="rounded-xl border px-3 py-2 text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => void onCreateAction()}
                                disabled={ruleSaving}
                                className="rounded-full bg-admin-primary px-3 py-2 text-sm text-white disabled:opacity-50"
                            >
                                {ruleSaving ? "..." : "Добавить"}
                            </button>
                        </div>
                        <div className="space-y-2">
                            {rules.map((rule) => (
                                <div
                                    key={rule.id}
                                    className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm"
                                >
                                    <div className="min-w-0">
                                        <div className="font-medium">
                                            {rule.pattern} {"->"} {rule.replacement}
                                        </div>
                                        <div className="text-xs text-admin-text-secondary">
                                            sort: {rule.sort_order} / {rule.is_active ? "active" : "off"}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void onToggleRuleAction(rule)}
                                            className="rounded-md border px-2 py-1 text-xs"
                                        >
                                            On/Off
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void onDeleteRuleAction(rule)}
                                            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600"
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
        </div>
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
    if (!open) {
        return null;
    }

    return (
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
                        <div className="rounded-xl border bg-admin-muted px-3 py-2 text-xs text-admin-text-secondary">
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
                                    className="w-full rounded-xl border px-3 py-2 text-sm"
                                />
                            </label>
                            <label className="space-y-1 text-sm">
                                <span className="text-admin-text-secondary">Курс RUB (3.15)</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={form.price_rate}
                                    onChange={(e) => onChangeAction("price_rate", Number(e.target.value))}
                                    className="w-full rounded-xl border px-3 py-2 text-sm"
                                />
                            </label>
                            <label className="space-y-1 text-sm">
                                <span className="text-admin-text-secondary">Коэффициент на сложение</span>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={form.price_fixed_fee}
                                    onChange={(e) => onChangeAction("price_fixed_fee", Number(e.target.value))}
                                    className="w-full rounded-xl border px-3 py-2 text-sm"
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
                                    className="w-full rounded-xl border px-3 py-2 text-sm"
                                />
                            </label>
                        </div>
                        <button
                            type="button"
                            onClick={() => void onSaveAction()}
                            disabled={saving}
                            className="rounded-full bg-admin-primary px-4 py-2 text-sm text-white shadow-sm transition hover:bg-admin-primary-hover disabled:opacity-50"
                        >
                            {saving ? "Сохраняю..." : "Сохранить формулу"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

import type { Dispatch, SetStateAction } from "react";
import type { SellerOneMatchRule, SellerOnePricingSettings } from "@/types/Vanille";
import { getConfidenceBadgeClass, formatVariantOptionLabel } from "./utils";
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
    linkingRowId,
    setManualLink,
    onCloseAction,
    onPickProductAction,
    onPickDefinitionAction,
    onConfirmAction,
}: {
    manualLink: ManualLinkState;
    linkingRowId: number | null;
    setManualLink: Dispatch<SetStateAction<ManualLinkState | null>>;
    onCloseAction: () => void;
    onPickProductAction: (productId: number) => Promise<void>;
    onPickDefinitionAction: (definitionId: number) => Promise<void>;
    onConfirmAction: (rowId: number, variantId: number) => Promise<void>;
}) {
    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/50 px-4 py-6">
            <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center">
                <div className="flex max-h-full w-full flex-col rounded-2xl bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b px-5 py-4">
                        <div className="text-sm font-medium">Принудительная связка для товара: <strong>{manualLink.rowName}</strong></div>
                        <button type="button" onClick={onCloseAction} className="text-xs text-admin-text-secondary">
                            Закрыть
                        </button>
                    </div>
                    <div className="space-y-3 overflow-y-auto px-5 py-4">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-admin-text-secondary">Локальный товар (поиск
                                по мере ввода)</label>
                            <input
                                type="text"
                                value={manualLink.productSearch}
                                onChange={(e) =>
                                    setManualLink((prev) =>
                                        prev ? { ...prev, productSearch: e.target.value } : prev
                                    )
                                }
                                className="w-full rounded-xl border px-3 py-2 text-sm"
                                placeholder="Бренд, название…"
                            />
                        </div>
                        {manualLink.productsLoading ? (
                            <div className="text-xs text-admin-text-secondary">Поиск товаров…</div>
                        ) : null}
                        {!manualLink.productsLoading && manualLink.products.length === 0 ? (
                            <div className="rounded-xl border bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                Товары не найдены. Попробуй упростить запрос (например, только бренд + часть
                                названия).
                            </div>
                        ) : null}
                        {manualLink.products.length > 0 && !manualLink.selectedProductId ? (
                            <>
                                <div className="text-xs font-medium text-admin-text">Формулировка (поиск по мере ввода,
                                    нажми строку — добавится к товару)</div>
                                <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border bg-white p-1">
                                    {manualLink.products.map((product: ProductAdminItem) => {
                                        const active = manualLink.selectedProductId === product.id;
                                        return (
                                            <button
                                                key={product.id}
                                                type="button"
                                                onClick={() => void onPickProductAction(product.id)}
                                                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${active ? "bg-admin-primary text-white" : "hover:bg-admin-muted"
                                                    }`}
                                            >
                                                {product.brand?.name
                                                    ? `${product.brand.name} ${product.name}`.trim()
                                                    : product.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        ) : null}
                        {manualLink.selectedProductId ? (
                            <div className="rounded-xl border bg-admin-muted px-3 py-2 text-xs text-admin-text">
                                {(() => {
                                    const selectedProduct = manualLink.products.find(
                                        (product) => product.id === manualLink.selectedProductId
                                    );
                                    const selectedLabel = `${selectedProduct?.name}`

                                    return (
                                        <>
                                            <div>
                                                Выбранный продукт: <strong className="text-sm">{selectedLabel}</strong>
                                            </div>

                                        </>
                                    );
                                })()}
                            </div>
                        ) : null}
                        {manualLink.selectedProductId ? (
                            <div className="space-y-2 rounded-xl border border-dashed border-admin-border bg-admin-muted/80 p-3">
                                <div className="text-xs font-medium text-admin-text">Формулировка (поиск по мере ввода,
                                    нажми строку — добавится к товару)</div>
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
                                {manualLink.definitionsLoading ? (
                                    <div className="text-xs text-admin-text-secondary">Поиск в справочнике…</div>
                                ) : null}
                                {!manualLink.definitionsLoading && manualLink.definitionSearch.trim() === "" ? (
                                    <div className="text-[11px] text-admin-text-secondary">Введи запрос — список обновится сам.</div>
                                ) : null}
                                {!manualLink.definitionsLoading
                                    && manualLink.definitionSearch.trim() !== ""
                                    && manualLink.definitions.length === 0 ? (
                                    <div className="text-xs text-amber-700">Ничего не найдено.</div>
                                ) : null}
                                {manualLink.definitions.length > 0 ? (
                                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border bg-white p-1">
                                        {manualLink.definitions.map((def: VariantDefinitionItem) => (
                                            <button
                                                key={def.id}
                                                type="button"
                                                disabled={manualLink.attachingDefinition}
                                                onClick={() => void onPickDefinitionAction(def.id)}
                                                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-admin-muted disabled:opacity-50"
                                            >
                                                {def.title}
                                            </button>
                                        ))}
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
        </div >
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

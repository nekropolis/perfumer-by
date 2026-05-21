import type { Dispatch, SetStateAction } from "react";
import { formatVariantOptionLabel } from "@/components/admin/import-export/seller-one/utils";
import type { VariantDefinitionItem } from "@/lib/admin-product-variants-api";
import type { ProductAdminItem } from "@/lib/admin-products-api";
import type { StockReceiptManualLinkState } from "./types";

export function StockReceiptManualLinkModal({
    manualLink,
    setManualLink,
    onCloseAction,
    onPickProductAction,
    onPickDefinitionAction,
    onConfirmAction,
}: {
    manualLink: StockReceiptManualLinkState;
    setManualLink: Dispatch<SetStateAction<StockReceiptManualLinkState | null>>;
    onCloseAction: () => void;
    onPickProductAction: (productId: number) => Promise<void>;
    onPickDefinitionAction: (definitionId: number) => Promise<void>;
    onConfirmAction: (variantId: number) => void;
}) {
    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/50 px-4 py-6">
            <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center">
                <div className="flex max-h-full w-full flex-col rounded-2xl bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b px-5 py-4">
                        <div className="text-sm font-medium">
                            Ручная связка строки прихода: <strong>{manualLink.rowTitle}</strong>
                        </div>
                        <button type="button" onClick={onCloseAction} className="text-xs text-admin-text-secondary">
                            Закрыть
                        </button>
                    </div>
                    <div className="space-y-3 overflow-y-auto px-5 py-4">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-admin-text-secondary">
                                Локальный товар (поиск по мере ввода)
                            </label>
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
                                Товары не найдены. Попробуй упростить запрос (например, только бренд + часть названия).
                            </div>
                        ) : null}
                        {manualLink.products.length > 0 && !manualLink.selectedProductId ? (
                            <>
                                <div className="text-xs font-medium text-admin-text">
                                    Кандидаты (нажми строку — загрузятся варианты)
                                </div>
                                <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border bg-white p-1">
                                    {manualLink.products.map((product: ProductAdminItem) => {
                                        const active = manualLink.selectedProductId === product.id;
                                        return (
                                            <button
                                                key={product.id}
                                                type="button"
                                                onClick={() => void onPickProductAction(product.id)}
                                                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                                    active ? "bg-admin-primary text-white" : "hover:bg-admin-muted"
                                                }`}
                                            >
                                                {product.name}
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
                                    const selectedLabel = selectedProduct
                                        ? `${selectedProduct.brand?.name ? `${selectedProduct.brand.name} / ` : ""}${selectedProduct.name}`
                                        : "";
                                    return (
                                        <div>
                                            Выбранный продукт: <strong className="text-sm">{selectedLabel}</strong>
                                        </div>
                                    );
                                })()}
                            </div>
                        ) : null}
                        {manualLink.variantsLoading ? (
                            <div className="text-xs text-admin-text-secondary">Загрузка вариантов…</div>
                        ) : null}
                        {manualLink.selectedProductId && !manualLink.variantsLoading && manualLink.variants.length > 1 ? (
                            <div>
                                <label className="mb-1 block text-xs font-medium text-admin-text-secondary">Вариант</label>
                                <select
                                    value={manualLink.selectedVariantId ?? ""}
                                    onChange={(e) => {
                                        const v = Number(e.target.value || 0) || null;
                                        setManualLink((prev) => (prev ? { ...prev, selectedVariantId: v } : prev));
                                    }}
                                    className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
                                >
                                    <option value="">—</option>
                                    {manualLink.variants.map((v) => (
                                        <option key={v.id} value={v.id}>
                                            {formatVariantOptionLabel(v)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : null}
                        {manualLink.selectedProductId ? (
                            <div className="space-y-2 rounded-xl border border-dashed border-admin-border bg-admin-muted/80 p-3">
                                <div className="text-xs font-medium text-admin-text">
                                    Справочник формулировок (поиск по мере ввода)
                                </div>
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
                                {!manualLink.definitionsLoading &&
                                manualLink.definitionSearch.trim() !== "" &&
                                manualLink.definitions.length === 0 ? (
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
                                    onClick={() => onConfirmAction(manualLink.selectedVariantId!)}
                                    className="rounded-full bg-admin-primary px-4 py-2 text-sm text-white"
                                >
                                    Применить к строке прихода
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}

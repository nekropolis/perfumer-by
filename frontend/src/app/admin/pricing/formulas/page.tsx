"use client";

import { useCallback, useEffect, useState } from "react";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import AdminTableShell from "@/components/admin/ui/admin-table-shell";
import PriceFormulasTable from "@/components/admin/pricing/price-formulas-table";
import {
    createPriceFormula,
    deletePriceFormula,
    fetchBynRate,
    fetchPriceFormulas,
    fetchPricingSources,
    updatePriceFormula,
    type PriceFormulaItem,
    type PriceFormulaPayload,
    type PriceFormulaVariantRule,
    type PricingSourceOption,
} from "@/lib/admin-pricing-api";
import { adminCheckbox } from "@/lib/admin-ui-classes";

const RULE_MODE_LABELS: Record<PriceFormulaItem["variant_rule_mode"], string> = {
    apply_to_all: "Все варианты",
    apply_when_match: "Только при совпадении",
    skip_when_match: "Пропуск при совпадении",
};

const VARIANT_RULE_FIELD_LABELS: Record<PriceFormulaVariantRule["field"], string> = {
    is_promotion: "Акция",
    is_vial: "Пробник / виалка",
    is_tester: "Тестер",
    is_preorder: "Предзаказ",
};

const EMPTY_FORM: PriceFormulaPayload = {
    name: "",
    source_type: "supplier",
    source_id: 0,
    multiplier: 1.28,
    rub_rate: 3.15,
    addend: 7,
    round_precision: 1,
    variant_rule_mode: "apply_to_all",
    variant_rules: null,
    is_active: true,
    sort_order: 100,
};

function sourceLabel(
    item: PriceFormulaItem,
    suppliers: PricingSourceOption[],
    warehouses: PricingSourceOption[],
): string {
    if (item.source_type === "supplier") {
        return suppliers.find((s) => s.id === item.source_id)?.name || `Поставщик #${item.source_id}`;
    }
    return warehouses.find((w) => w.id === item.source_id)?.name || `Склад #${item.source_id}`;
}

export default function AdminPricingFormulasPage() {
    const [items, setItems] = useState<PriceFormulaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [suppliers, setSuppliers] = useState<PricingSourceOption[]>([]);
    const [warehouses, setWarehouses] = useState<PricingSourceOption[]>([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState<PriceFormulaItem | null>(null);
    const [form, setForm] = useState<PriceFormulaPayload>(EMPTY_FORM);
    const [deleteTarget, setDeleteTarget] = useState<PriceFormulaItem | null>(null);
    const [meta, setMeta] = useState<{ total: number } | null>(null);
    const [bynRate, setBynRate] = useState<string | null>(null);

    const loadItems = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const [formulasRes, sourcesRes, bynRes] = await Promise.all([
                fetchPriceFormulas({ page: 1 }),
                fetchPricingSources(),
                fetchBynRate(),
            ]);
            setItems(formulasRes.data || []);
            setMeta({ total: formulasRes.total ?? formulasRes.data?.length ?? 0 });
            setSuppliers(sourcesRes.data.suppliers || []);
            setWarehouses(sourcesRes.data.warehouses || []);
            setBynRate(bynRes.data.rate);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadItems();
    }, [loadItems]);

    const openCreate = () => {
        setEditing(null);
        setForm({
            ...EMPTY_FORM,
            rub_rate: Number(bynRate ?? EMPTY_FORM.rub_rate),
            source_id: suppliers[0]?.id || warehouses[0]?.id || 0,
            source_type: suppliers[0] ? "supplier" : "warehouse",
        });
        setModalOpen(true);
    };

    const openEdit = (item: PriceFormulaItem) => {
        setEditing(item);
        setForm({
            name: item.name,
            source_type: item.source_type,
            source_id: item.source_id,
            multiplier: Number(item.multiplier),
            rub_rate: Number(bynRate ?? item.rub_rate),
            addend: Number(item.addend),
            round_precision: item.round_precision,
            variant_rule_mode: item.variant_rule_mode,
            variant_rules: item.variant_rules,
            is_active: item.is_active,
            sort_order: item.sort_order,
        });
        setModalOpen(true);
    };

    const toggleRuleFlag = (field: PriceFormulaVariantRule["field"], checked: boolean) => {
        const current = form.variant_rules || [];
        const without = current.filter((r) => r.field !== field);
        setForm({
            ...form,
            variant_rules: checked
                ? [...without, { field, op: "eq", value: true }]
                : without.length > 0 ? without : null,
        });
    };

    const save = async () => {
        setSaving(true);
        setError("");
        try {
            if (editing) {
                await updatePriceFormula(editing.id, form);
                setSuccess("Формула обновлена");
            } else {
                await createPriceFormula(form);
                setSuccess("Формула создана");
            }
            setModalOpen(false);
            await loadItems();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка сохранения");
        } finally {
            setSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            await deletePriceFormula(deleteTarget.id);
            setSuccess("Формула удалена");
            setDeleteTarget(null);
            await loadItems();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка удаления");
        }
    };

    const sourceOptions = form.source_type === "supplier" ? suppliers : warehouses;

    return (
        <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <p className="text-sm text-admin-text-secondary">
                            Цена = ОКРУГЛ((закупка × коэффициент + сложение) × курс; точность).
                            Внутри одного источника формулы проверяются по возрастанию приоритета — меньшее значение срабатывает раньше.
                    </p>
                    <button type="button" onClick={openCreate} className="shrink-0 rounded-lg border px-4 py-2 text-sm">
                        Добавить формулу
                    </button>
                </div>

                {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}
                {success ? <AdminFeedbackMessage type="success" message={success} onCloseAction={() => setSuccess("")} /> : null}

                {loading ? <AdminLoadingState /> : items.length === 0 ? (
                    <AdminEmptyState title="Формул пока нет" description="Добавьте первую формулу для склада или поставщика." />
                ) : (
                    <AdminTableShell total={meta?.total ?? items.length}>
                        <PriceFormulasTable
                            items={items}
                            sourceLabelAction={(item) => sourceLabel(item, suppliers, warehouses)}
                            onEditAction={openEdit}
                            onDeleteAction={setDeleteTarget}
                        />
                    </AdminTableShell>
                )}

            {modalOpen ? (
                <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
                    <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
                        <div className="flex shrink-0 items-center justify-between border-b border-admin-border px-4 py-2.5">
                            <h2 className="text-sm font-semibold">{editing ? "Редактирование" : "Новая формула"}</h2>
                            <button
                                type="button"
                                className="rounded-md px-2 py-1 text-xs text-admin-text-secondary hover:bg-admin-muted"
                                onClick={() => setModalOpen(false)}
                            >
                                Закрыть
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                            <div className="grid gap-2 sm:grid-cols-2">
                                <label className="space-y-0.5 text-xs sm:col-span-2">
                                    <span className="text-admin-text-secondary">Название</span>
                                    <input className="w-full rounded-md border px-2.5 py-1.5 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                                </label>
                                <label className="space-y-0.5 text-xs">
                                    <span className="text-admin-text-secondary">Тип источника</span>
                                    <select className="w-full rounded-md border px-2.5 py-1.5 text-sm" value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value as PriceFormulaPayload["source_type"], source_id: 0 })}>
                                        <option value="supplier">Поставщик</option>
                                        <option value="warehouse">Склад</option>
                                    </select>
                                </label>
                                <label className="space-y-0.5 text-xs">
                                    <span className="text-admin-text-secondary">Источник</span>
                                    <select className="w-full rounded-md border px-2.5 py-1.5 text-sm" value={form.source_id || ""} onChange={(e) => setForm({ ...form, source_id: Number(e.target.value) })}>
                                        <option value="">Выберите</option>
                                        {sourceOptions.map((opt) => (
                                            <option key={opt.id} value={opt.id}>{opt.name}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="space-y-0.5 text-xs">
                                    <span className="text-admin-text-secondary">Коэфф. умножения</span>
                                    <input type="number" step="0.01" className="w-full rounded-md border px-2.5 py-1.5 text-sm" value={form.multiplier} onChange={(e) => setForm({ ...form, multiplier: Number(e.target.value) })} />
                                </label>
                                <div className="space-y-0.5 text-xs">
                                    <span className="block text-admin-text-secondary">Курс BYN</span>
                                    <div className="rounded-md border bg-admin-muted px-2.5 py-1.5 tabular-nums text-sm text-admin-text">
                                        {bynRate ?? form.rub_rate}р
                                    </div>
                                </div>
                                <label className="space-y-0.5 text-xs">
                                    <span className="text-admin-text-secondary">Сложение</span>
                                    <input type="number" step="0.1" className="w-full rounded-md border px-2.5 py-1.5 text-sm" value={form.addend} onChange={(e) => setForm({ ...form, addend: Number(e.target.value) })} />
                                </label>
                                <label className="space-y-0.5 text-xs">
                                    <span className="text-admin-text-secondary">Округление</span>
                                    <input type="number" min={0} max={4} className="w-full rounded-md border px-2.5 py-1.5 text-sm" value={form.round_precision} onChange={(e) => setForm({ ...form, round_precision: Number(e.target.value) })} />
                                </label>
                                <label className="space-y-0.5 text-xs sm:col-span-2">
                                    <span className="text-admin-text-secondary">Режим правил</span>
                                    <select className="w-full rounded-md border px-2.5 py-1.5 text-sm" value={form.variant_rule_mode} onChange={(e) => setForm({ ...form, variant_rule_mode: e.target.value as PriceFormulaPayload["variant_rule_mode"] })}>
                                        {Object.entries(RULE_MODE_LABELS).map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </select>
                                </label>
                                {form.variant_rule_mode !== "apply_to_all" ? (
                                    <div className="space-y-1.5 sm:col-span-2">
                                        <div className="text-xs font-medium text-admin-text-secondary">Условия (все должны совпасть)</div>
                                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                                            {(["is_promotion", "is_vial", "is_tester", "is_preorder"] as const).map((field) => (
                                                <label key={field} className="flex items-center gap-1.5 text-sm">
                                                    <input
                                                        type="checkbox"
                                                        className={adminCheckbox}
                                                        checked={Boolean(form.variant_rules?.some((r) => r.field === field && r.value))}
                                                        onChange={(e) => toggleRuleFlag(field, e.target.checked)}
                                                    />
                                                    <span>{VARIANT_RULE_FIELD_LABELS[field]}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                                <label className="space-y-0.5 text-xs">
                                    <span className="text-admin-text-secondary">Приоритет</span>
                                    <input type="number" className="w-full rounded-md border px-2.5 py-1.5 text-sm" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
                                </label>
                                <label className="flex items-end gap-1.5 pb-1.5 text-sm">
                                    <input type="checkbox" className={adminCheckbox} checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                                    <span>Активна</span>
                                </label>
                            </div>
                        </div>
                        <div className="flex shrink-0 justify-end gap-2 border-t border-admin-border px-4 py-2.5">
                            <button type="button" className="rounded-md border px-3 py-1.5 text-sm" onClick={() => setModalOpen(false)}>Отмена</button>
                            <button type="button" className="rounded-md border bg-admin-primary px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={saving} onClick={() => void save()}>
                                {saving ? "Сохранение..." : "Сохранить"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            <AdminConfirmDialog
                open={!!deleteTarget}
                title="Удалить формулу?"
                message={deleteTarget ? `«${deleteTarget.name}» будет удалена.` : ""}
                confirmText="Удалить"
                loading={false}
                onCloseAction={() => setDeleteTarget(null)}
                onConfirmAction={() => void confirmDelete()}
            />
        </div>
    );
}

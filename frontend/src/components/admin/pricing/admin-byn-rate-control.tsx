"use client";

import { useCallback, useEffect, useState } from "react";
import AdminModalShell from "@/components/admin/ui/admin-modal-shell";
import { fetchBynRate, updateBynRate } from "@/lib/admin-pricing-api";
import { adminBtnPrimary, adminBtnSecondary, adminInput } from "@/lib/admin-ui-classes";

type Props = {
    className?: string;
    fullWidth?: boolean;
    onBeforeOpenAction?: () => void;
};

function formatRateLabel(rate: string | null): string {
    if (!rate) return "Курс BYN";
    return `Курс BYN — ${rate}р`;
}

export default function AdminBynRateControl({
    className = "",
    fullWidth = false,
    onBeforeOpenAction,
}: Props) {
    const [rate, setRate] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const loadRate = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchBynRate();
            setRate(res.data.rate);
        } catch {
            setRate(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadRate();
    }, [loadRate]);

    const openModal = () => {
        onBeforeOpenAction?.();
        setDraft(rate ?? "3.15");
        setError("");
        setOpen(true);
    };

    const save = async () => {
        setSaving(true);
        setError("");
        try {
            const res = await updateBynRate(Number(draft));
            setRate(res.data.rate);
            setOpen(false);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Не удалось сохранить курс");
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={openModal}
                disabled={loading}
                className={`inline-flex origin-center items-center text-sm font-medium tabular-nums text-admin-text underline decoration-admin-border-strong underline-offset-4 transition duration-150 hover:scale-105 hover:text-admin-primary hover:decoration-admin-primary disabled:opacity-60 ${fullWidth ? "w-full justify-start" : ""} ${className}`}
                title="Изменить курс BYN"
            >
                {loading ? "Курс BYN…" : formatRateLabel(rate)}
            </button>

            <AdminModalShell
                open={open}
                onCloseAction={() => setOpen(false)}
                title="Курс BYN"
                maxWidthClass="sm:max-w-md"
                footer={
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            className={adminBtnSecondary}
                            onClick={() => setOpen(false)}
                            disabled={saving}
                        >
                            Отмена
                        </button>
                        <button
                            type="button"
                            className={adminBtnPrimary}
                            onClick={() => void save()}
                            disabled={saving || draft.trim() === ""}
                        >
                            {saving ? "Сохранение…" : "Сохранить"}
                        </button>
                    </div>
                }
            >
                <div className="space-y-3">
                    <p className="text-sm text-admin-text-secondary">
                        Используется во всех формулах цен: Цена = ОКРУГЛ((закупка × коэффициент + сложение) ×
                        курс).
                    </p>
                    <label className="block space-y-1.5 text-sm">
                        <span className="font-medium text-admin-text">Новый курс</span>
                        <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            className={adminInput}
                            autoFocus
                        />
                    </label>
                    {error ? <p className="text-sm text-red-600">{error}</p> : null}
                </div>
            </AdminModalShell>
        </>
    );
}

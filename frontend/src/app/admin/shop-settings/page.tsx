"use client";

import { useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import {
    fetchAdminShopDeliverySettings,
    updateAdminShopDeliverySettings,
    type ShopDeliverySettings,
} from "@/lib/admin-shop-settings-api";

const empty: ShopDeliverySettings = {
    delivery_minsk_free_threshold: 50,
    delivery_minsk_fee: 3,
    delivery_belarus_fee: 6,
    delivery_belarus_free_min_lines: 2,
};

export default function AdminShopSettingsPage() {
    const [form, setForm] = useState<ShopDeliverySettings>(empty);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await fetchAdminShopDeliverySettings();
                if (!cancelled) {
                    setForm(res.data);
                }
            } catch (e) {
                if (!cancelled) {
                    setMessage({ type: "error", text: e instanceof Error ? e.message : "Ошибка загрузки" });
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const save = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const res = await updateAdminShopDeliverySettings(form);
            setForm(res.data);
            setMessage({ type: "success", text: "Сохранено" });
        } catch (e) {
            setMessage({ type: "error", text: e instanceof Error ? e.message : "Ошибка сохранения" });
        } finally {
            setSaving(false);
        }
    };

    return (
        <AdminPageCard>
            <Breadcrumbs
                className="mb-4"
                items={[
                    { label: "Админка", href: "/admin" },
                    { label: "Основное", href: "/admin" },
                    { label: "Доставка" },
                ]}
            />

            <h1 className="mb-2 text-2xl font-semibold">Настройки доставки</h1>
            <p className="mb-6 text-sm text-gray-600">
                Пороги и тарифы используются на витрине при оформлении заказа (Минск / РБ).
            </p>

            {message ? <AdminFeedbackMessage type={message.type} message={message.text} onCloseAction={() => setMessage(null)} /> : null}

            {loading ? (
                <AdminLoadingState text="Загрузка..." />
            ) : (
                <div className="max-w-xl space-y-5 rounded-2xl border border-gray-200 bg-white p-5">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Минск: бесплатно от (BYN)</label>
                        <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={form.delivery_minsk_free_threshold}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, delivery_minsk_free_threshold: Number(e.target.value) }))
                            }
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Минск: платная доставка (BYN)</label>
                        <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={form.delivery_minsk_fee}
                            onChange={(e) => setForm((f) => ({ ...f, delivery_minsk_fee: Number(e.target.value) }))}
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">РБ: платная доставка (BYN)</label>
                        <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={form.delivery_belarus_fee}
                            onChange={(e) => setForm((f) => ({ ...f, delivery_belarus_fee: Number(e.target.value) }))}
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                            РБ: бесплатно от числа позиций (наименований)
                        </label>
                        <input
                            type="number"
                            min={1}
                            value={form.delivery_belarus_free_min_lines}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, delivery_belarus_free_min_lines: Number(e.target.value) }))
                            }
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => void save()}
                        disabled={saving}
                        className="rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                        {saving ? "Сохранение..." : "Сохранить"}
                    </button>
                </div>
            )}
        </AdminPageCard>
    );
}

"use client";

import { useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import {
    fetchAdminShopDeliverySettings,
    updateAdminShopDeliverySettings,
    type ShopSettings,
} from "@/lib/admin-shop-settings-api";

type ShopTab = "delivery" | "contacts";

const empty: ShopSettings = {
    delivery_minsk_free_threshold: 50,
    delivery_minsk_fee: 3,
    delivery_belarus_fee: 6,
    delivery_belarus_free_min_lines: 2,
    contact_phone_mts: "+375336408833",
    contact_phone_a1: "+375296408833",
    contact_phone_life: "+375256408833",
    contact_telegram_url: "https://t.me/perfumer_support",
    contact_viber_url: "viber://chat?number=%2B375296408833",
};

const tabButtonClass = (active: boolean) =>
    `-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
        active
            ? "border-slate-900 text-slate-900"
            : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
    }`;

export default function AdminShopSettingsPage() {
    const [tab, setTab] = useState<ShopTab>("delivery");
    const [form, setForm] = useState<ShopSettings>(empty);
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
                    { label: "Настройки магазина" },
                ]}
            />

            <h1 className="mb-2 text-2xl font-semibold">Настройки магазина</h1>
            <p className="mb-4 text-sm text-admin-text-secondary">
                {tab === "delivery"
                    ? "Пороги и тарифы доставки для витрины (Минск / РБ)."
                    : "Телефоны и мессенджеры для шапки и контактов на витрине."}
            </p>

            <div className="mb-6 flex flex-wrap gap-1 border-b border-admin-border">
                <button type="button" className={tabButtonClass(tab === "delivery")} onClick={() => setTab("delivery")}>
                    Доставка
                </button>
                <button type="button" className={tabButtonClass(tab === "contacts")} onClick={() => setTab("contacts")}>
                    Контакты
                </button>
            </div>

            {message ? <AdminFeedbackMessage type={message.type} message={message.text} onCloseAction={() => setMessage(null)} /> : null}

            {loading ? (
                <AdminLoadingState text="Загрузка..." />
            ) : (
                <>
                    {tab === "delivery" ? (
                        <div className="max-w-xl space-y-5 rounded-2xl border border-admin-border bg-white p-5">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-admin-text">Минск: бесплатно от (BYN)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    value={form.delivery_minsk_free_threshold}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, delivery_minsk_free_threshold: Number(e.target.value) }))
                                    }
                                    className="w-full rounded-xl border border-admin-border px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-admin-text">Минск: платная доставка (BYN)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    value={form.delivery_minsk_fee}
                                    onChange={(e) => setForm((f) => ({ ...f, delivery_minsk_fee: Number(e.target.value) }))}
                                    className="w-full rounded-xl border border-admin-border px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-admin-text">РБ: платная доставка (BYN)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    value={form.delivery_belarus_fee}
                                    onChange={(e) => setForm((f) => ({ ...f, delivery_belarus_fee: Number(e.target.value) }))}
                                    className="w-full rounded-xl border border-admin-border px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-admin-text">
                                    РБ: бесплатно от числа позиций (наименований)
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    value={form.delivery_belarus_free_min_lines}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, delivery_belarus_free_min_lines: Number(e.target.value) }))
                                    }
                                    className="w-full rounded-xl border border-admin-border px-3 py-2 text-sm"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-xl space-y-5 rounded-2xl border border-admin-border bg-white p-5">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-admin-text">МТС</label>
                                <input
                                    type="text"
                                    value={form.contact_phone_mts}
                                    onChange={(e) => setForm((f) => ({ ...f, contact_phone_mts: e.target.value }))}
                                    className="w-full rounded-xl border border-admin-border px-3 py-2 text-sm"
                                    placeholder="Номер"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-admin-text">A1</label>
                                <input
                                    type="text"
                                    value={form.contact_phone_a1}
                                    onChange={(e) => setForm((f) => ({ ...f, contact_phone_a1: e.target.value }))}
                                    className="w-full rounded-xl border border-admin-border px-3 py-2 text-sm"
                                    placeholder="Номер"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-admin-text">Life</label>
                                <input
                                    type="text"
                                    value={form.contact_phone_life}
                                    onChange={(e) => setForm((f) => ({ ...f, contact_phone_life: e.target.value }))}
                                    className="w-full rounded-xl border border-admin-border px-3 py-2 text-sm"
                                    placeholder="Номер"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-admin-text">Telegram (ссылка)</label>
                                <input
                                    type="url"
                                    value={form.contact_telegram_url}
                                    onChange={(e) => setForm((f) => ({ ...f, contact_telegram_url: e.target.value }))}
                                    className="w-full rounded-xl border border-admin-border px-3 py-2 text-sm"
                                    placeholder="https://t.me/…"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-admin-text">Viber (ссылка)</label>
                                <input
                                    type="text"
                                    value={form.contact_viber_url}
                                    onChange={(e) => setForm((f) => ({ ...f, contact_viber_url: e.target.value }))}
                                    className="w-full rounded-xl border border-admin-border px-3 py-2 text-sm"
                                    placeholder="viber://chat?number=…"
                                />
                                <p className="mt-1 text-xs text-admin-text-secondary">Допустимы ссылки вида viber://…</p>
                            </div>
                        </div>
                    )}

                    <div className="mt-6">
                        <button
                            type="button"
                            onClick={() => void save()}
                            disabled={saving}
                            className="rounded-full bg-admin-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-admin-primary-hover disabled:opacity-50"
                        >
                            {saving ? "Сохранение..." : "Сохранить"}
                        </button>
                    </div>
                </>
            )}
        </AdminPageCard>
    );
}

"use client";

import { adminBtnPrimary } from "@/lib/admin-ui-classes";

import { useEffect, useMemo, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import {
    fetchAdminShopDeliverySettings,
    updateAdminShopDeliverySettings,
    type ShopBrandOption,
    type ShopSettings,
} from "@/lib/admin-shop-settings-api";
import {
    fetchProductBrandOptions,
    type ProductBrandOption,
} from "@/lib/admin-products-api";
import OrderTagsManager from "@/components/admin/shop-settings/order-tags-manager";
import OrderStatusesManager from "@/components/admin/shop-settings/order-statuses-manager";

type ShopTab = "delivery" | "contacts" | "brands" | "tags" | "statuses";

const HOME_POPULAR_BRANDS_MAX = 5;
const SEARCH_POPULAR_BRANDS_MAX = 8;

const empty: ShopSettings = {
    delivery_minsk_free_threshold: 50,
    delivery_minsk_fee: 3,
    delivery_belarus_fee: 6,
    delivery_belarus_free_min_lines: 2,
    contact_phone_mts: "+375336408833",
    contact_phone_a1: "+375296408833",
    contact_phone_life: "+375256408833",
    contact_email: "admin@perfumer.by",
    legal_name: "ИП Гришкевич П.А.",
    legal_unp: "191168408",
    legal_address: "",
    contact_telegram_url: "https://t.me/perfumer_support",
    contact_viber_url: "viber://chat?number=%2B375296408833",
    waiting_discount_delivery_date: "10.07.2026",
    home_popular_brands: [],
    search_popular_brands: [],
};

const tabButtonClass = (active: boolean) =>
    `-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
        active
            ? "border-slate-900 text-slate-900"
            : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
    }`;

function tabDescription(tab: ShopTab): string {
    if (tab === "delivery") return "Пороги и тарифы доставки для витрины (Минск / РБ).";
    if (tab === "contacts") return "Телефоны, email, реквизиты и мессенджеры для витрины.";
    if (tab === "tags") return "Теги заказов: название и цвет.";
    if (tab === "statuses") return "Статусы заказов: название, цвет и активность.";
    return "Бренды на главной (до 5) и популярные бренды в поиске (до 8).";
}

function BrandPicker({
    label,
    selected,
    brandOptions,
    max,
    onAdd,
    onRemove,
    onLimitExceeded,
}: {
    label: string;
    selected: ShopBrandOption[];
    brandOptions: ProductBrandOption[];
    max: number;
    onAdd: (brand: ProductBrandOption) => void;
    onRemove: (id: number) => void;
    onLimitExceeded: () => void;
}) {
    const [query, setQuery] = useState("");
    const selectedIds = useMemo(() => new Set(selected.map((b) => b.id)), [selected]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = q
            ? brandOptions.filter((b) => b.name.toLowerCase().includes(q) || b.slug.toLowerCase().includes(q))
            : brandOptions;
        return list.filter((b) => !selectedIds.has(b.id)).slice(0, 20);
    }, [brandOptions, query, selectedIds]);

    const tryAdd = (brand: ProductBrandOption) => {
        if (selectedIds.has(brand.id)) return;
        if (selected.length >= max) {
            onLimitExceeded();
            return;
        }
        onAdd(brand);
        setQuery("");
    };

    return (
        <div>
            <label className="mb-1 block text-sm font-medium text-admin-text">{label}</label>
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Начните вводить название…"
                className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm"
                autoComplete="off"
            />
            {query.trim() ? (
                <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-admin-border">
                    {filtered.length > 0 ? (
                        filtered.map((brand) => (
                            <button
                                key={brand.id}
                                type="button"
                                onClick={() => tryAdd(brand)}
                                className="block w-full border-b border-admin-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-admin-muted"
                            >
                                {brand.name}
                            </button>
                        ))
                    ) : (
                        <div className="px-3 py-4 text-center text-sm text-admin-text-secondary">Ничего не найдено</div>
                    )}
                </div>
            ) : null}
            <p className="mt-1 text-xs text-admin-text-secondary">
                Выбрано {selected.length} из {max}
            </p>
            {selected.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                    {selected.map((brand) => (
                        <span
                            key={brand.id}
                            className="inline-flex items-center gap-1.5 rounded-full border border-admin-border bg-admin-muted px-3 py-1 text-sm text-admin-text"
                        >
                            {brand.name}
                            <button
                                type="button"
                                onClick={() => onRemove(brand.id)}
                                className="text-admin-text-secondary hover:text-admin-text"
                                aria-label={`Удалить ${brand.name}`}
                            >
                                ×
                            </button>
                        </span>
                    ))}
                </div>
            ) : (
                <p className="mt-2 text-sm text-admin-text-secondary">Бренды ещё не выбраны.</p>
            )}
        </div>
    );
}

export default function AdminShopSettingsPage() {
    const [tab, setTab] = useState<ShopTab>("delivery");
    const [form, setForm] = useState<ShopSettings>(empty);
    const [brandOptions, setBrandOptions] = useState<ProductBrandOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const [settingsRes, brandsRes] = await Promise.all([
                    fetchAdminShopDeliverySettings(),
                    fetchProductBrandOptions(),
                ]);
                if (!cancelled) {
                    setForm({
                        ...empty,
                        ...settingsRes.data,
                        home_popular_brands: settingsRes.data.home_popular_brands ?? [],
                        search_popular_brands: settingsRes.data.search_popular_brands ?? [],
                    });
                    setBrandOptions(brandsRes.data ?? []);
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
            const payload =
                tab === "brands"
                    ? {
                          home_popular_brand_ids: form.home_popular_brands.map((b) => b.id),
                          search_popular_brand_ids: form.search_popular_brands.map((b) => b.id),
                      }
                    : {
                          delivery_minsk_free_threshold: form.delivery_minsk_free_threshold,
                          delivery_minsk_fee: form.delivery_minsk_fee,
                          delivery_belarus_fee: form.delivery_belarus_fee,
                          delivery_belarus_free_min_lines: form.delivery_belarus_free_min_lines,
                          contact_phone_mts: form.contact_phone_mts,
                          contact_phone_a1: form.contact_phone_a1,
                          contact_phone_life: form.contact_phone_life,
                          contact_email: form.contact_email,
                          legal_name: form.legal_name,
                          legal_unp: form.legal_unp,
                          legal_address: form.legal_address,
                          contact_telegram_url: form.contact_telegram_url,
                          contact_viber_url: form.contact_viber_url,
                      };
            const res = await updateAdminShopDeliverySettings(payload);
            setForm({
                ...empty,
                ...res.data,
                home_popular_brands: res.data.home_popular_brands ?? [],
                search_popular_brands: res.data.search_popular_brands ?? [],
            });
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
            <p className="mb-4 text-sm text-admin-text-secondary">{tabDescription(tab)}</p>

            <div className="mb-6 flex flex-wrap gap-1 border-b border-admin-border">
                <button type="button" className={tabButtonClass(tab === "delivery")} onClick={() => setTab("delivery")}>
                    Доставка
                </button>
                <button type="button" className={tabButtonClass(tab === "contacts")} onClick={() => setTab("contacts")}>
                    Контакты
                </button>
                <button type="button" className={tabButtonClass(tab === "brands")} onClick={() => setTab("brands")}>
                    Бренды
                </button>
                <button type="button" className={tabButtonClass(tab === "tags")} onClick={() => setTab("tags")}>
                    Теги
                </button>
                <button type="button" className={tabButtonClass(tab === "statuses")} onClick={() => setTab("statuses")}>
                    Статусы заказов
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
                                    className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm"
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
                                    className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm"
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
                                    className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-admin-text">
                                    РБ: бесплатно от числа единиц (штук)
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    value={form.delivery_belarus_free_min_lines}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, delivery_belarus_free_min_lines: Number(e.target.value) }))
                                    }
                                    className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm"
                                />
                            </div>
                        </div>
                    ) : tab === "brands" ? (
                        <div className="max-w-xl space-y-8 rounded-2xl border border-admin-border bg-white p-5">
                            <BrandPicker
                                label="Бренды на главной"
                                selected={form.home_popular_brands}
                                brandOptions={brandOptions}
                                max={HOME_POPULAR_BRANDS_MAX}
                                onAdd={(brand) => {
                                    setMessage(null);
                                    setForm((f) => ({
                                        ...f,
                                        home_popular_brands: [
                                            ...f.home_popular_brands,
                                            { id: brand.id, name: brand.name, slug: brand.slug },
                                        ],
                                    }));
                                }}
                                onRemove={(id) =>
                                    setForm((f) => ({
                                        ...f,
                                        home_popular_brands: f.home_popular_brands.filter((b) => b.id !== id),
                                    }))
                                }
                                onLimitExceeded={() =>
                                    setMessage({ type: "error", text: "Можно выбрать не более 5 брендов" })
                                }
                            />
                            <BrandPicker
                                label="Бренды для поиска"
                                selected={form.search_popular_brands}
                                brandOptions={brandOptions}
                                max={SEARCH_POPULAR_BRANDS_MAX}
                                onAdd={(brand) => {
                                    setMessage(null);
                                    setForm((f) => ({
                                        ...f,
                                        search_popular_brands: [
                                            ...f.search_popular_brands,
                                            { id: brand.id, name: brand.name, slug: brand.slug },
                                        ],
                                    }));
                                }}
                                onRemove={(id) =>
                                    setForm((f) => ({
                                        ...f,
                                        search_popular_brands: f.search_popular_brands.filter((b) => b.id !== id),
                                    }))
                                }
                                onLimitExceeded={() =>
                                    setMessage({ type: "error", text: "Можно выбрать не более 8 брендов" })
                                }
                            />
                        </div>
                    ) : tab === "tags" ? (
                        <OrderTagsManager />
                    ) : tab === "statuses" ? (
                        <OrderStatusesManager />
                    ) : (
                        <div className="max-w-xl space-y-5 rounded-2xl border border-admin-border bg-white p-5">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-admin-text">МТС</label>
                                <input
                                    type="text"
                                    value={form.contact_phone_mts}
                                    onChange={(e) => setForm((f) => ({ ...f, contact_phone_mts: e.target.value }))}
                                    className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm"
                                    placeholder="Номер"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-admin-text">A1</label>
                                <input
                                    type="text"
                                    value={form.contact_phone_a1}
                                    onChange={(e) => setForm((f) => ({ ...f, contact_phone_a1: e.target.value }))}
                                    className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm"
                                    placeholder="Номер"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-admin-text">Life</label>
                                <input
                                    type="text"
                                    value={form.contact_phone_life}
                                    onChange={(e) => setForm((f) => ({ ...f, contact_phone_life: e.target.value }))}
                                    className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm"
                                    placeholder="Номер"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-admin-text">Email</label>
                                <input
                                    type="email"
                                    value={form.contact_email}
                                    onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                                    className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm"
                                    placeholder="admin@perfumer.by"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-admin-text">Юр. название</label>
                                <input
                                    type="text"
                                    value={form.legal_name}
                                    onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))}
                                    className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm"
                                    placeholder="ИП …"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-admin-text">УНП</label>
                                <input
                                    type="text"
                                    value={form.legal_unp}
                                    onChange={(e) => setForm((f) => ({ ...f, legal_unp: e.target.value }))}
                                    className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm"
                                    placeholder="191168408"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-admin-text">Адрес</label>
                                <input
                                    type="text"
                                    value={form.legal_address}
                                    onChange={(e) => setForm((f) => ({ ...f, legal_address: e.target.value }))}
                                    className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm"
                                    placeholder="г. Минск, …"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-admin-text">Telegram (ссылка)</label>
                                <input
                                    type="url"
                                    value={form.contact_telegram_url}
                                    onChange={(e) => setForm((f) => ({ ...f, contact_telegram_url: e.target.value }))}
                                    className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm"
                                    placeholder="https://t.me/…"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-admin-text">Viber (ссылка)</label>
                                <input
                                    type="text"
                                    value={form.contact_viber_url}
                                    onChange={(e) => setForm((f) => ({ ...f, contact_viber_url: e.target.value }))}
                                    className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm"
                                    placeholder="viber://chat?number=…"
                                />
                                <p className="mt-1 text-xs text-admin-text-secondary">Допустимы ссылки вида viber://…</p>
                            </div>
                        </div>
                    )}

                    {tab !== "tags" && tab !== "statuses" ? (
                        <div className="mt-6">
                            <button
                                type="button"
                                onClick={() => void save()}
                                disabled={saving}
                                className={`${adminBtnPrimary} w-full sm:w-auto`}
                            >
                                {saving ? "Сохранение..." : "Сохранить"}
                            </button>
                        </div>
                    ) : null}
                </>
            )}
        </AdminPageCard>
    );
}

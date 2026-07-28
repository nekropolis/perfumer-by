"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminModalShell from "@/components/admin/ui/admin-modal-shell";
import {
  createOrderStatus,
  fetchOrderStatuses,
  updateOrderStatus,
  type OrderStatus,
} from "@/lib/admin-order-statuses-api";
import { adminBtnPrimary, adminCheckbox } from "@/lib/admin-ui-classes";

const PRESET_COLORS = [
  "#64748B",
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#14B8A6",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#78716C",
];

type FormState = {
  id?: number;
  name: string;
  color: string;
  code: string;
  sort_order: number;
  is_active: boolean;
  is_system?: boolean;
};

const emptyForm = (): FormState => ({
  name: "",
  color: "#64748B",
  code: "",
  sort_order: 0,
  is_active: true,
});

function normalizeHex(value: string): string {
  const raw = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) {
    return raw.toUpperCase();
  }
  return "#64748B";
}

function contrastText(hex: string): string {
  const m = hex.match(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/);
  if (!m) return "#fff";
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.62 ? "#111827" : "#ffffff";
}

export default function OrderStatusesManager() {
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchOrderStatuses();
      setStatuses(res.data);
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: "Не удалось загрузить статусы" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    const maxSort = statuses.reduce((max, row) => Math.max(max, row.sort_order), 0);
    setForm({ ...emptyForm(), sort_order: maxSort + 10 });
    setMessage(null);
  };

  const openEdit = (status: OrderStatus) => {
    setForm({
      id: status.id,
      name: status.name,
      color: normalizeHex(status.color),
      code: status.code,
      sort_order: status.sort_order,
      is_active: status.is_active,
      is_system: status.is_system,
    });
    setMessage(null);
  };

  const save = async () => {
    if (!form) return;
    const name = form.name.trim();
    if (!name) {
      setMessage({ type: "error", text: "Укажите название статуса" });
      return;
    }
    const color = normalizeHex(form.color);
    setSaving(true);
    setMessage(null);
    try {
      if (form.id) {
        await updateOrderStatus(form.id, {
          name,
          color,
          sort_order: form.sort_order,
          is_active: form.is_active,
        });
        setMessage({ type: "success", text: "Статус обновлён" });
      } else {
        const code = form.code.trim().toLowerCase();
        await createOrderStatus({
          name,
          color,
          sort_order: form.sort_order,
          is_active: form.is_active,
          ...(code ? { code } : {}),
        });
        setMessage({ type: "success", text: "Статус создан" });
      }
      setForm(null);
      await load();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Не удалось сохранить статус",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (status: OrderStatus) => {
    setMessage(null);
    try {
      await updateOrderStatus(status.id, {
        name: status.name,
        color: normalizeHex(status.color),
        sort_order: status.sort_order,
        is_active: !status.is_active,
      });
      await load();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Не удалось изменить активность",
      });
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      {message ? (
        <AdminFeedbackMessage
          type={message.type}
          message={message.text}
          onCloseAction={() => setMessage(null)}
        />
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-admin-text-secondary">
          Статусы заказов: название, цвет и активность. Удалять нельзя — только отключать.
        </p>
        <button type="button" onClick={openCreate} className={`${adminBtnPrimary} shrink-0`}>
          <Plus size={16} className="mr-1 inline" />
          Добавить
        </button>
      </div>

      {loading ? (
        <AdminLoadingState text="Загрузка статусов…" />
      ) : statuses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-admin-border bg-white px-4 py-8 text-center text-sm text-admin-text-secondary">
          Статусов пока нет. Создайте первый.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-admin-border bg-white">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-admin-muted/80 text-left text-[11px] font-semibold uppercase tracking-wide text-admin-text-secondary">
              <tr>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2">Код</th>
                <th className="px-3 py-2">Порядок</th>
                <th className="px-3 py-2">Активен</th>
                <th className="px-3 py-2 text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {statuses.map((status) => (
                <tr
                  key={status.id}
                  className={`border-t border-admin-border/70 ${status.is_active ? "" : "opacity-60"}`}
                >
                  <td className="px-3 py-2">
                    <span
                      className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: status.color,
                        color: contrastText(status.color),
                      }}
                    >
                      {status.name}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-admin-text-secondary">{status.code}</td>
                  <td className="px-3 py-2 tabular-nums text-admin-text-secondary">{status.sort_order}</td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={status.is_active}
                      onChange={() => void toggleActive(status)}
                      className={adminCheckbox}
                      aria-label={status.is_active ? "Отключить статус" : "Включить статус"}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(status)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-admin-border text-admin-text-secondary hover:bg-admin-muted hover:text-admin-text"
                        aria-label={`Редактировать статус ${status.name}`}
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminModalShell
        open={form !== null}
        onCloseAction={() => !saving && setForm(null)}
        title={form?.id ? "Редактировать статус" : "Новый статус"}
        maxWidthClass="sm:max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setForm(null)}
              className="rounded-lg border border-admin-border px-3 py-1.5 text-sm text-admin-text-secondary hover:bg-admin-muted"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-admin-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        }
      >
        {form ? (
          <div className="space-y-4">
            <label className="block text-sm text-admin-text-secondary">
              Название
              <input
                value={form.name}
                onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
                className="mt-1 w-full rounded-lg border border-admin-border px-3 py-2 text-sm text-admin-text"
                placeholder="Например, Ожидает оплату"
                autoFocus
              />
            </label>

            {form.id ? (
              <div className="text-sm text-admin-text-secondary">
                Код:{" "}
                <span className="font-mono text-admin-text">{form.code}</span>
                {form.is_system ? (
                  <span className="ml-2 text-xs text-admin-text-secondary">(системный)</span>
                ) : null}
              </div>
            ) : (
              <label className="block text-sm text-admin-text-secondary">
                Код (необязательно)
                <input
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) =>
                      f
                        ? {
                            ...f,
                            code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                          }
                        : f,
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-admin-border px-3 py-2 font-mono text-sm text-admin-text"
                  placeholder="Авто из названия"
                />
              </label>
            )}

            <label className="block text-sm text-admin-text-secondary">
              Порядок
              <input
                type="number"
                min={0}
                max={9999}
                value={form.sort_order}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, sort_order: Number(e.target.value) || 0 } : f))
                }
                className="mt-1 w-full rounded-lg border border-admin-border px-3 py-2 text-sm text-admin-text"
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-admin-text">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => (f ? { ...f, is_active: e.target.checked } : f))}
                className={adminCheckbox}
              />
              Активен (показывать в списках)
            </label>

            <div>
              <div className="mb-1 text-sm text-admin-text-secondary">Цвет</div>
              <div className="flex flex-wrap items-center gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => (f ? { ...f, color: c } : f))}
                    className={`h-7 w-7 rounded-full border-2 transition ${
                      form.color.toUpperCase() === c ? "border-slate-900 scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Цвет ${c}`}
                    title={c}
                  />
                ))}
                <label className="ml-1 inline-flex items-center gap-2 text-xs text-admin-text-secondary">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, color: normalizeHex(e.target.value) } : f))
                    }
                    className="h-8 w-10 cursor-pointer rounded border border-admin-border bg-white p-0.5"
                  />
                  Свой
                </label>
              </div>
              <div className="mt-3">
                <span
                  className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: form.color,
                    color: contrastText(form.color),
                  }}
                >
                  {form.name.trim() || "Превью"}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </AdminModalShell>
    </div>
  );
}

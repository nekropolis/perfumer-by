"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminModalShell from "@/components/admin/ui/admin-modal-shell";
import {
  createOrderTag,
  deleteOrderTag,
  fetchOrderTags,
  updateOrderTag,
  type OrderTag,
} from "@/lib/admin-order-tags-api";
import { adminBtnPrimary } from "@/lib/admin-ui-classes";

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
};

const emptyForm = (): FormState => ({
  name: "",
  color: "#64748B",
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

export default function OrderTagsManager() {
  const [tags, setTags] = useState<OrderTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OrderTag | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchOrderTags();
      setTags(res.data);
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: "Не удалось загрузить теги" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setForm(emptyForm());
    setMessage(null);
  };

  const openEdit = (tag: OrderTag) => {
    setForm({ id: tag.id, name: tag.name, color: normalizeHex(tag.color) });
    setMessage(null);
  };

  const save = async () => {
    if (!form) return;
    const name = form.name.trim();
    if (!name) {
      setMessage({ type: "error", text: "Укажите название тега" });
      return;
    }
    const color = normalizeHex(form.color);
    setSaving(true);
    setMessage(null);
    try {
      if (form.id) {
        await updateOrderTag(form.id, { name, color });
        setMessage({ type: "success", text: "Тег обновлён" });
      } else {
        await createOrderTag({ name, color });
        setMessage({ type: "success", text: "Тег создан" });
      }
      setForm(null);
      await load();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Не удалось сохранить тег",
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteOrderTag(deleteTarget.id);
      setDeleteTarget(null);
      setMessage({ type: "success", text: "Тег удалён" });
      await load();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Не удалось удалить тег",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      {message ? (
        <AdminFeedbackMessage
          type={message.type}
          message={message.text}
          onCloseAction={() => setMessage(null)}
        />
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-admin-text-secondary">
          Теги для заказов: название и цвет. Используются в форме и таблице заказов.
        </p>
        <button type="button" onClick={openCreate} className={`${adminBtnPrimary} shrink-0`}>
          <Plus size={16} className="mr-1 inline" />
          Добавить
        </button>
      </div>

      {loading ? (
        <AdminLoadingState text="Загрузка тегов…" />
      ) : tags.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-admin-border bg-white px-4 py-8 text-center text-sm text-admin-text-secondary">
          Тегов пока нет. Создайте первый.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-admin-border bg-white">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-admin-muted/80 text-left text-[11px] font-semibold uppercase tracking-wide text-admin-text-secondary">
              <tr>
                <th className="px-3 py-2">Тег</th>
                <th className="px-3 py-2">Цвет</th>
                <th className="px-3 py-2 text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((tag) => (
                <tr key={tag.id} className="border-t border-admin-border/70">
                  <td className="px-3 py-2">
                    <span
                      className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: tag.color,
                        color: contrastText(tag.color),
                      }}
                    >
                      {tag.name}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-admin-text-secondary">{tag.color}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(tag)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-admin-border text-admin-text-secondary hover:bg-admin-muted hover:text-admin-text"
                        aria-label={`Редактировать тег ${tag.name}`}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(tag)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-admin-border text-red-600 hover:bg-red-50"
                        aria-label={`Удалить тег ${tag.name}`}
                      >
                        <Trash2 size={13} />
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
        title={form?.id ? "Редактировать тег" : "Новый тег"}
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
                placeholder="Например, Срочный"
                autoFocus
              />
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

      <AdminConfirmDialog
        open={deleteTarget !== null}
        title="Удалить тег?"
        message={
          deleteTarget
            ? `Тег «${deleteTarget.name}» будет удалён. У заказов он тоже снимется.`
            : ""
        }
        confirmText="Удалить"
        confirmLoadingText="Удаление…"
        cancelText="Отмена"
        loading={deleting}
        onCloseAction={() => setDeleteTarget(null)}
        onConfirmAction={() => void confirmDelete()}
      />
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import useDebouncedValue from "@/hooks/use-debounced-value";
import { createOrderTag, fetchOrderTags, type OrderTag } from "@/lib/admin-order-tags-api";
import { solidColorPillStyle, SOLID_PILL_CHIP_CLASS } from "@/constants/order-statuses";

type Props = {
  selected: OrderTag[];
  onChangeAction: (tags: OrderTag[]) => void;
  compact?: boolean;
};

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

function normalizeTagNameKey(name: string): string {
  return name.trim().toLocaleLowerCase("ru-RU");
}

export default function AdminOrderTagsPicker({ selected, onChangeAction, compact = false }: Props) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 200);
  const [hits, setHits] = useState<OrderTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const closeMenu = () => {
    setOpen(false);
    setQuery("");
    setCreateError("");
  };

  const selectedIds = useMemo(() => new Set(selected.map((t) => t.id)), [selected]);
  const createName = query.trim();
  const createNameKey = normalizeTagNameKey(createName);

  const existingByName = useMemo(() => {
    if (!createNameKey) {
      return null;
    }
    const fromHits = hits.find((t) => normalizeTagNameKey(t.name) === createNameKey);
    if (fromHits) {
      return fromHits;
    }
    return selected.find((t) => normalizeTagNameKey(t.name) === createNameKey) ?? null;
  }, [createNameKey, hits, selected]);

  const canCreate = createName.length > 0 && !existingByName && !loading;

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    void fetchOrderTags({ search: debouncedQuery.trim() || undefined })
      .then((res) => {
        if (!cancelled) {
          setHits(res.data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHits([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, debouncedQuery]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) {
        return;
      }
      closeMenu();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setCreateError("");
      setCreating(false);
    }
  }, [open]);

  const pickTag = (tag: OrderTag) => {
    if (!selectedIds.has(tag.id)) {
      onChangeAction([...selected, tag]);
    }
    closeMenu();
  };

  const removeTag = (id: number) => {
    onChangeAction(selected.filter((t) => t.id !== id));
  };

  const createTag = async () => {
    const name = createName;
    if (!name) {
      setCreateError("Укажите название тега");
      return;
    }
    if (existingByName) {
      if (!selectedIds.has(existingByName.id)) {
        onChangeAction([...selected, existingByName]);
      }
      closeMenu();
      return;
    }

    setCreating(true);
    setCreateError("");
    try {
      const res = await createOrderTag({ name, color: newColor });
      const tag = res.data;
      if (!selectedIds.has(tag.id)) {
        onChangeAction([...selected, tag]);
      }
      closeMenu();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Не удалось создать тег");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={rootRef} className={compact ? "space-y-1.5" : "space-y-2"}>
      {selected.length > 0 ? (
        <div className={`flex flex-wrap ${compact ? "gap-1" : "gap-1.5"}`}>
          {selected.map((tag) => (
            <span
              key={tag.id}
              className={`${SOLID_PILL_CHIP_CLASS} gap-1 ${compact ? "" : "px-2.5 text-[11px]"}`}
              style={solidColorPillStyle(tag.color)}
            >
              <span className="min-w-0 truncate">{tag.name}</span>
              <button
                type="button"
                onClick={() => removeTag(tag.id)}
                className="rounded-full p-0.5 opacity-80 hover:bg-black/10 hover:opacity-100"
                aria-label={`Убрать тег ${tag.name}`}
              >
                <X size={compact ? 11 : 12} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => (open ? closeMenu() : setOpen(true))}
        className={`flex w-full items-center justify-between gap-2 rounded-[12px] border border-black/10 bg-[#f2f2f7] text-left text-admin-text shadow-sm transition hover:bg-[#ebebf0] ${
          compact ? "px-2.5 py-1.5 text-[13px]" : "px-3 py-2 text-[15px]"
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={selected.length > 0 ? "text-admin-text" : "text-[#3c3c43]/60"}>
          {selected.length > 0 ? `Выбрано: ${selected.length}` : "Выбрать тег"}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2.25}
          className={`shrink-0 text-[#3c3c43]/50 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          className="overflow-hidden rounded-[14px] border border-black/10 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
          role="listbox"
          aria-label="Выбор тегов"
        >
          <div className="border-b border-black/[0.08] bg-white px-3 py-2.5">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCreateError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreate && !creating) {
                  e.preventDefault();
                  void createTag();
                }
              }}
              placeholder="Поиск или новый тег"
              className="w-full rounded-[10px] border-0 bg-[#767680]/12 px-3 py-2 text-[15px] text-admin-text outline-none placeholder:text-[#3c3c43]/60 focus:bg-[#767680]/18"
            />
          </div>
          <div className="max-h-[min(12rem,40dvh)] overflow-y-auto overscroll-contain py-1">
            {loading ? (
              <div className="px-4 py-3 text-[13px] text-[#3c3c43]/60">Загрузка…</div>
            ) : hits.length === 0 ? (
              <div className="px-4 py-3 text-[13px] text-[#3c3c43]/60">
                {createName ? "Такого тега пока нет" : "Ничего не найдено"}
              </div>
            ) : (
              <ul>
                {hits.map((tag, index) => {
                  const isSelected = selectedIds.has(tag.id);
                  return (
                    <li key={tag.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => pickTag(tag)}
                        className={`flex w-full items-center gap-3 px-4 py-[11px] text-left transition active:bg-black/[0.06] ${
                          isSelected ? "bg-[#007aff]/08" : "hover:bg-black/[0.04]"
                        }`}
                      >
                        <span
                          className="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="min-w-0 flex-1 truncate text-[15px] font-normal tracking-[-0.01em] text-admin-text">
                          {tag.name}
                        </span>
                        <span
                          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                            isSelected ? "bg-[#007aff] text-white" : "border border-black/15 bg-white"
                          }`}
                        >
                          {isSelected ? <Check size={12} strokeWidth={3} /> : null}
                        </span>
                      </button>
                      {index < hits.length - 1 ? (
                        <div className="ml-[2.75rem] border-b border-black/[0.08]" />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-black/[0.08] bg-[#f2f2f7]/80 px-3 py-2.5">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {PRESET_COLORS.map((color) => {
                const active = newColor.toUpperCase() === color.toUpperCase();
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewColor(color)}
                    className={`h-5 w-5 rounded-full ring-1 ring-black/10 transition ${
                      active ? "ring-2 ring-admin-primary ring-offset-1" : "hover:scale-105"
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Цвет ${color}`}
                    title={color}
                  />
                );
              })}
            </div>
            {createError ? (
              <p className="mb-2 text-[12px] text-red-600">{createError}</p>
            ) : existingByName && createName ? (
              <p className="mb-2 text-[12px] text-[#3c3c43]/60">
                Тег «{existingByName.name}» уже есть — выберите его в списке
              </p>
            ) : null}
            <button
              type="button"
              disabled={!canCreate || creating}
              onClick={() => void createTag()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-admin-primary px-3 py-2 text-[13px] font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={14} strokeWidth={2.5} />
              {creating
                ? "Создание…"
                : createName
                  ? `Создать «${createName}»`
                  : "Введите название нового тега"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}


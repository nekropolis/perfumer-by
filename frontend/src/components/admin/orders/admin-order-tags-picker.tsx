"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import useDebouncedValue from "@/hooks/use-debounced-value";
import { fetchOrderTags, type OrderTag } from "@/lib/admin-order-tags-api";

type Props = {
  selected: OrderTag[];
  onChangeAction: (tags: OrderTag[]) => void;
  compact?: boolean;
};

type MenuCoords = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
};

function contrastText(hex: string): string {
  const m = hex.match(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/i);
  if (!m) return "#fff";
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.62 ? "#111827" : "#ffffff";
}

export default function AdminOrderTagsPicker({ selected, onChangeAction, compact = false }: Props) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const [hits, setHits] = useState<OrderTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [menuCoords, setMenuCoords] = useState<MenuCoords | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedIds = useMemo(() => new Set(selected.map((t) => t.id)), [selected]);
  const showMenu = open && query.trim().length >= 2;

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void fetchOrderTags({ search: q })
      .then((res) => {
        if (!cancelled) {
          setHits(res.data.filter((t) => !selectedIds.has(t.id)));
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
  }, [debouncedQuery, selectedIds]);

  const updateMenuPosition = () => {
    if (!inputRef.current) {
      return;
    }
    const rect = inputRef.current.getBoundingClientRect();
    const menuWidth = Math.min(Math.max(rect.width, 220), Math.max(0, window.innerWidth - 24));
    const menuHeight = Math.min(192, 12 + Math.max(1, hits.length || 1) * 36);
    const pad = 8;
    const gap = 4;
    let left = rect.left;
    left = Math.min(Math.max(pad, left), window.innerWidth - menuWidth - pad);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight + pad && rect.top > spaceBelow;
    setMenuCoords({
      top: openUp ? undefined : rect.bottom + gap,
      bottom: openUp ? window.innerHeight - rect.top + gap : undefined,
      left,
      width: menuWidth,
    });
  };

  useLayoutEffect(() => {
    if (!showMenu) {
      setMenuCoords(null);
      return;
    }
    updateMenuPosition();
  }, [showMenu, hits.length, loading, query]);

  useEffect(() => {
    if (!showMenu) {
      return;
    }
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onReposition = () => updateMenuPosition();

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [showMenu, hits.length]);

  const addTag = (tag: OrderTag) => {
    if (selectedIds.has(tag.id)) return;
    onChangeAction([...selected, tag]);
    setQuery("");
    setHits([]);
    setOpen(false);
  };

  const removeTag = (id: number) => {
    onChangeAction(selected.filter((t) => t.id !== id));
  };

  const menu =
    showMenu && menuCoords && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] max-h-48 overflow-y-auto rounded-lg border border-admin-border bg-admin-surface shadow-lg"
            style={{
              top: menuCoords.top,
              bottom: menuCoords.bottom,
              left: menuCoords.left,
              width: menuCoords.width,
            }}
            role="listbox"
            aria-label="Поиск тегов"
          >
            {loading ? (
              <div className="px-3 py-2 text-xs text-admin-text-secondary">Поиск…</div>
            ) : hits.length === 0 ? (
              <div className="px-3 py-2 text-xs text-admin-text-secondary">Ничего не найдено</div>
            ) : (
              <ul>
                {hits.map((tag) => (
                  <li key={tag.id}>
                    <button
                      type="button"
                      role="option"
                      onClick={() => addTag(tag)}
                      className={`flex w-full items-center gap-2 text-left text-sm hover:bg-admin-muted ${
                        compact ? "px-2.5 py-1.5" : "px-3 py-2"
                      }`}
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={compact ? "space-y-1.5" : "space-y-2"}>
      {selected.length > 0 ? (
        <div className={`flex flex-wrap ${compact ? "gap-1" : "gap-1.5"}`}>
          {selected.map((tag) => (
            <span
              key={tag.id}
              className={`inline-flex items-center gap-1 rounded-full font-medium ${
                compact ? "px-2 py-0 text-[11px]" : "px-2.5 py-0.5 text-xs"
              }`}
              style={{ backgroundColor: tag.color, color: contrastText(tag.color) }}
            >
              {tag.name}
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

      <div className="relative">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Поиск тега (от 2 букв)…"
          className={`w-full rounded-lg border border-admin-border bg-admin-surface text-sm text-admin-text ${
            compact ? "px-2.5 py-1.5" : "px-3 py-2"
          }`}
        />
      </div>
      {menu}
    </div>
  );
}

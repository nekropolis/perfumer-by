"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import useDebouncedValue from "@/hooks/use-debounced-value";
import { fetchOrderTags, type OrderTag } from "@/lib/admin-order-tags-api";

type Props = {
  selected: OrderTag[];
  onChangeAction: (tags: OrderTag[]) => void;
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

export default function AdminOrderTagsPicker({ selected, onChangeAction }: Props) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const [hits, setHits] = useState<OrderTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedIds = useMemo(() => new Set(selected.map((t) => t.id)), [selected]);

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

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

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

  return (
    <div ref={rootRef} className="space-y-2">
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ backgroundColor: tag.color, color: contrastText(tag.color) }}
            >
              {tag.name}
              <button
                type="button"
                onClick={() => removeTag(tag.id)}
                className="rounded-full p-0.5 opacity-80 hover:bg-black/10 hover:opacity-100"
                aria-label={`Убрать тег ${tag.name}`}
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Поиск тега (от 2 букв)…"
          className="w-full rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text"
        />

        {open && query.trim().length >= 2 ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-30 max-h-48 overflow-y-auto rounded-lg border border-admin-border bg-admin-surface shadow-lg">
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
                      onClick={() => addTag(tag)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-admin-muted"
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
          </div>
        ) : null}
      </div>
    </div>
  );
}

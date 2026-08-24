"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Option = {
    value: string;
    label: string;
};

type Props = {
    label: string;
    value: string;
    options: Option[];
    allLabel: string;
    onChangeAction: (value: string) => void;
};

export default function AdminHeaderSelectFilter({
    label,
    value,
    options,
    allLabel,
    onChangeAction,
}: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [menuCoords, setMenuCoords] = useState<{ top?: number; bottom?: number; left: number; minWidth: number; openUp: boolean } | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const hasFilter = value.trim() !== "";

    const updateMenuPosition = () => {
        if (!rootRef.current) {
            return;
        }
        const rect = rootRef.current.getBoundingClientRect();
        const measured = menuRef.current?.offsetWidth ?? 0;
        const minWidth = Math.min(Math.max(rect.width, measured || 160, 160), Math.max(0, window.innerWidth - 24));
        const menuHeight = Math.min(280, (options.length + 1) * 30 + 8);
        const pad = 8;
        const gap = 4;
        const placeWidth = Math.max(minWidth, measured || minWidth);
        let left = rect.left;
        if (window.innerWidth - rect.left < placeWidth + pad) {
            left = rect.right - placeWidth;
        }
        left = Math.min(Math.max(pad, left), window.innerWidth - placeWidth - pad);
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUp = spaceBelow < menuHeight + pad && rect.top > spaceBelow;
        setMenuCoords({
            top: openUp ? undefined : rect.bottom + gap,
            bottom: openUp ? window.innerHeight - rect.top + gap : undefined,
            left,
            minWidth,
            openUp,
        });
    };

    useLayoutEffect(() => {
        if (!isOpen) {
            return;
        }
        updateMenuPosition();
        const frame = window.requestAnimationFrame(() => updateMenuPosition());
        return () => window.cancelAnimationFrame(frame);
    }, [isOpen, options.length]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        const onPointerDown = (event: MouseEvent | TouchEvent) => {
            const target = event.target as Node;
            if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
                return;
            }
            setIsOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("touchstart", onPointerDown, { passive: true });
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("resize", updateMenuPosition);
        window.addEventListener("scroll", updateMenuPosition, true);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("touchstart", onPointerDown);
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("resize", updateMenuPosition);
            window.removeEventListener("scroll", updateMenuPosition, true);
        };
    }, [isOpen, options.length]);

    const menu =
        isOpen && menuCoords && typeof document !== "undefined"
            ? createPortal(
                  <div
                      ref={menuRef}
                      className="fixed z-[9999] max-h-[min(18rem,70vh)] overflow-y-auto rounded-xl border border-black/[0.06] bg-white p-0.5 shadow-[0_10px_28px_rgba(15,23,42,0.14)]"
                      style={{
                          top: menuCoords.top,
                          bottom: menuCoords.bottom,
                          left: menuCoords.left,
                          minWidth: menuCoords.minWidth,
                      }}
                      role="listbox"
                      aria-label={label}
                  >
                      <button
                          type="button"
                          role="option"
                          aria-selected={!hasFilter}
                          onClick={() => {
                              onChangeAction("");
                              setIsOpen(false);
                          }}
                          className={`flex min-h-7 w-full items-center justify-between gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition hover:bg-admin-muted ${
                              !hasFilter ? "bg-admin-muted/70" : ""
                          }`}
                      >
                          <span className="whitespace-nowrap">{allLabel}</span>
                          {!hasFilter ? <Check className="h-3.5 w-3.5 shrink-0 opacity-70" /> : <span className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                      </button>
                      {options.map((option) => {
                          const selected = value === option.value;
                          return (
                              <button
                                  key={option.value}
                                  type="button"
                                  role="option"
                                  aria-selected={selected}
                                  onClick={() => {
                                      onChangeAction(option.value);
                                      setIsOpen(false);
                                  }}
                                  className={`flex min-h-7 w-full items-center justify-between gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition hover:bg-admin-muted ${
                                      selected ? "bg-admin-muted/70" : ""
                                  }`}
                              >
                                  <span className="whitespace-nowrap">{option.label}</span>
                                  {selected ? <Check className="h-3.5 w-3.5 shrink-0 opacity-70" /> : <span className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                              </button>
                          );
                      })}
                  </div>,
                  document.body,
              )
            : null;

    return (
        <div className="relative inline-flex" ref={rootRef}>
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className="inline-flex items-center gap-0.5 bg-transparent p-0 text-left text-sm font-medium text-admin-text-secondary transition hover:text-admin-text focus:outline-none"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-label={`Фильтр: ${label}`}
                title={hasFilter ? options.find((item) => item.value === value)?.label ?? label : label}
            >
                <span>{label}</span>
                <ChevronDown
                    aria-hidden
                    strokeWidth={2.25}
                    className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                />
            </button>
            {menu}
        </div>
    );
}

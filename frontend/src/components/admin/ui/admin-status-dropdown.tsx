"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { orderStatusPillStyle } from "@/constants/order-statuses";

type Option = {
    value: string;
    label: string;
    triggerLabel?: string;
    menuLabel?: string;
    color?: string;
};

type Props = {
    value: string;
    options: Option[];
    onChangeAction: (value: string) => void;
    disabled?: boolean;
    /** «text» — solid pill-бейдж фиксированной ширины в таблице. */
    triggerVariant?: "default" | "text";
    /** Классы для `triggerVariant="text"`. */
    triggerTextClassName?: string;
    /** Цвет статуса для solid pill. */
    triggerColor?: string;
    widthClassName?: string;
    menuWidthClassName?: string;
    /** Выравнивание меню относительно триггера. `auto` — не уезжать за край экрана. */
    menuAlign?: "left" | "right" | "auto";
};

type MenuCoords = {
    top?: number;
    bottom?: number;
    left: number;
    minWidth: number;
    openUp: boolean;
};

export default function AdminStatusDropdown({
    value,
    options,
    onChangeAction,
    disabled = false,
    triggerVariant = "default",
    triggerTextClassName,
    triggerColor,
    widthClassName = "w-[168px]",
    menuWidthClassName = "w-max",
    menuAlign = "auto",
}: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [menuCoords, setMenuCoords] = useState<MenuCoords | null>(null);
    const [menuEntered, setMenuEntered] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    const currentOption = useMemo(
        () => options.find((item) => item.value === value),
        [options, value],
    );
    const currentLabel = currentOption?.triggerLabel ?? currentOption?.label ?? value;
    const resolvedTriggerColor = triggerColor?.trim() || currentOption?.color?.trim() || undefined;
    const pillStyle = resolvedTriggerColor ? orderStatusPillStyle(resolvedTriggerColor) : null;
    const pillClassName =
        "relative inline-flex h-7 w-full max-w-full items-center justify-center rounded-md px-2 text-center text-[10px] font-bold uppercase leading-none tracking-wide";

    const textTrigger = disabled ? (
        <span
            className={`${pillClassName} ${triggerTextClassName ?? ""}`}
            style={pillStyle ?? undefined}
        >
            <span className="min-w-0 truncate">{currentLabel}</span>
        </span>
    ) : (
        <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className={`${pillClassName} cursor-pointer transition hover:brightness-[1.03] active:brightness-95 ${triggerTextClassName ?? ""}`}
            style={pillStyle ?? undefined}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-label="Изменить статус"
        >
            <span className="min-w-0 truncate px-3">{currentLabel}</span>
            <ChevronDown
                aria-hidden
                strokeWidth={2.5}
                className={`pointer-events-none absolute right-1 h-3 w-3 shrink-0 opacity-80 transition-transform duration-200 ease-out will-change-transform ${isOpen ? "rotate-180" : ""}`}
            />
        </button>
    );

    const updateMenuPosition = () => {
        if (!rootRef.current) {
            return;
        }
        const rect = rootRef.current.getBoundingClientRect();
        const measured = menuRef.current?.offsetWidth ?? 0;
        const minWidth = Math.min(
            Math.max(rect.width, measured || 132, 132),
            Math.max(0, window.innerWidth - 24),
        );
        const menuHeight = Math.min(280, options.length * 30 + 8);
        const pad = 8;
        const gap = 4;
        const placeWidth = Math.max(minWidth, measured || minWidth);

        let left = rect.left;
        if (menuAlign === "right") {
            left = rect.right - placeWidth;
        } else if (menuAlign === "auto") {
            const spaceRight = window.innerWidth - rect.left;
            if (spaceRight < placeWidth + pad) {
                left = rect.right - placeWidth;
            }
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
            setMenuEntered(false);
            return;
        }
        updateMenuPosition();
        setMenuEntered(false);
        const frame = window.requestAnimationFrame(() => {
            setMenuEntered(true);
            updateMenuPosition();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [isOpen, menuAlign, options.length]);

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
        const onReposition = () => {
            updateMenuPosition();
        };

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
    }, [isOpen, menuAlign, options.length]);

    const rootClassName =
        triggerVariant === "text"
            ? `relative inline-flex max-w-full align-middle ${widthClassName === "w-[168px]" ? "w-full" : widthClassName}`
            : `relative inline-flex ${widthClassName}`;

    const defaultTrigger = (
        <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            disabled={disabled}
            className="flex min-h-10 w-full items-center justify-between rounded-lg border border-admin-border bg-admin-surface px-3 text-left text-sm font-medium shadow-sm transition hover:bg-admin-muted disabled:cursor-not-allowed disabled:bg-admin-muted disabled:opacity-60"
            style={resolvedTriggerColor ? { color: resolvedTriggerColor } : undefined}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-label="Статус"
        >
            <span className="truncate">{currentLabel}</span>
            <ChevronDown
                className={`h-4 w-4 shrink-0 opacity-55 transition ${isOpen ? "rotate-180" : ""}`}
            />
        </button>
    );

    const menu =
        isOpen && menuCoords && typeof document !== "undefined"
            ? createPortal(
                  <div
                      ref={menuRef}
                      className={`fixed z-[9999] max-h-[min(18rem,70vh)] overflow-y-auto rounded-xl border border-black/[0.06] bg-white p-0.5 shadow-[0_10px_28px_rgba(15,23,42,0.14)] transition-[opacity,transform] duration-150 ease-out ${
                          menuCoords.openUp ? "origin-bottom" : "origin-top"
                      } ${
                          menuEntered
                              ? "translate-y-0 scale-100 opacity-100"
                              : menuCoords.openUp
                                ? "translate-y-1 scale-[0.96] opacity-0"
                                : "-translate-y-1 scale-[0.96] opacity-0"
                      } ${menuWidthClassName}`}
                      style={{
                          top: menuCoords.top,
                          bottom: menuCoords.bottom,
                          left: menuCoords.left,
                          minWidth: menuCoords.minWidth,
                      }}
                      role="listbox"
                      aria-label="Выбор статуса"
                  >
                      {options.map((item) => {
                          const isActive = item.value === value;
                          const optionColor = item.color?.trim();
                          return (
                              <button
                                  key={item.value}
                                  type="button"
                                  role="option"
                                  aria-selected={isActive}
                                  onClick={() => {
                                      setIsOpen(false);
                                      onChangeAction(item.value);
                                  }}
                                  className={`flex min-h-7 w-full items-center justify-between gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition hover:bg-admin-muted ${
                                      isActive ? "bg-admin-muted/70" : ""
                                  }`}
                              >
                                  <span className="inline-flex items-center gap-1.5">
                                      {optionColor ? (
                                          <span
                                              aria-hidden
                                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                                              style={{ backgroundColor: optionColor }}
                                          />
                                      ) : null}
                                      <span
                                          className="whitespace-nowrap"
                                          style={optionColor ? { color: optionColor } : undefined}
                                      >
                                          {item.menuLabel ?? item.label}
                                      </span>
                                  </span>
                                  {isActive ? (
                                      <Check className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                  ) : (
                                      <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                  )}
                              </button>
                          );
                      })}
                  </div>,
                  document.body,
              )
            : null;

    return (
        <div className={rootClassName} ref={rootRef}>
            {triggerVariant === "text" ? textTrigger : defaultTrigger}
            {menu}
        </div>
    );
}

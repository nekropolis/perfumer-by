"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Option = {
    value: string;
    label: string;
};

type Props = {
    value: string;
    options: Option[];
    onChangeAction: (value: string) => void;
    disabled?: boolean;
    /** «text» — показывать только подпись статуса; дропдаун по клику (как у кнопки). */
    triggerVariant?: "default" | "text";
    /** Классы цвета текста для `triggerVariant="text"` (например из `getOrderStatusTableTextClass`). */
    triggerTextClassName?: string;
    widthClassName?: string;
    menuWidthClassName?: string;
    /** Выравнивание меню относительно триггера. `auto` — не уезжать за край экрана. */
    menuAlign?: "left" | "right" | "auto";
};

type MenuCoords = {
    top?: number;
    bottom?: number;
    left: number;
    width: number;
};

export default function AdminStatusDropdown({
    value,
    options,
    onChangeAction,
    disabled = false,
    triggerVariant = "default",
    triggerTextClassName,
    widthClassName = "w-[168px]",
    menuWidthClassName = "w-[220px]",
    menuAlign = "auto",
}: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [menuCoords, setMenuCoords] = useState<MenuCoords | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    const currentLabel = useMemo(
        () => options.find((item) => item.value === value)?.label ?? value,
        [options, value],
    );

    const updateMenuPosition = () => {
        if (!rootRef.current) {
            return;
        }
        const rect = rootRef.current.getBoundingClientRect();
        const menuWidth = Math.min(220, Math.max(0, window.innerWidth - 24));
        const menuHeight = Math.min(320, options.length * 40 + 16);
        const pad = 8;
        const gap = 6;

        let left = rect.left;
        if (menuAlign === "right") {
            left = rect.right - menuWidth;
        } else if (menuAlign === "auto") {
            const spaceRight = window.innerWidth - rect.left;
            if (spaceRight < menuWidth + pad) {
                left = rect.right - menuWidth;
            }
        }
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
        if (!isOpen) {
            setMenuCoords(null);
            return;
        }
        updateMenuPosition();
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
            ? "relative inline-block align-middle max-w-full"
            : `relative inline-flex ${widthClassName}`;

    const defaultTrigger = (
        <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            disabled={disabled}
            className="flex min-h-10 w-full items-center justify-between rounded-lg border border-admin-border bg-admin-surface px-3 text-left text-sm text-admin-text shadow-sm transition hover:bg-admin-muted disabled:cursor-not-allowed disabled:bg-admin-muted disabled:text-admin-text-muted"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-label="Статус"
        >
            <span className="truncate">{currentLabel}</span>
            <ChevronDown
                className={`h-4 w-4 shrink-0 text-admin-text-muted transition ${isOpen ? "rotate-180" : ""}`}
            />
        </button>
    );

    const textColorClass = triggerTextClassName?.trim() || "text-admin-text";

    const textTrigger = disabled ? (
        <span className={`text-sm font-medium ${textColorClass}`}>{currentLabel}</span>
    ) : (
        <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className={`inline-flex max-w-full cursor-pointer items-center gap-1.5 border-x-0 border-t-0 border-b-2 border-solid border-current bg-transparent px-0 pb-0.5 pt-0 text-left text-sm font-medium transition hover:opacity-90 ${textColorClass}`}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-label="Изменить статус"
        >
            <span className="min-w-0 break-words">{currentLabel}</span>
            <ChevronDown
                aria-hidden
                strokeWidth={2.25}
                className={`h-3.5 w-3.5 shrink-0 opacity-55 transition-transform duration-200 ease-out will-change-transform ${isOpen ? "rotate-180" : ""}`}
            />
        </button>
    );

    const menu =
        isOpen && menuCoords && typeof document !== "undefined"
            ? createPortal(
                  <div
                      ref={menuRef}
                      className={`fixed z-[9999] max-h-[min(20rem,70vh)] overflow-y-auto rounded-lg border border-admin-border bg-admin-surface p-1 shadow-lg ${menuWidthClassName}`}
                      style={{
                          top: menuCoords.top,
                          bottom: menuCoords.bottom,
                          left: menuCoords.left,
                          width: menuCoords.width,
                      }}
                      role="listbox"
                      aria-label="Выбор статуса"
                  >
                      {options.map((item) => {
                          const isActive = item.value === value;
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
                                  className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${isActive ? "bg-admin-primary/10 text-admin-primary" : "text-admin-text hover:bg-admin-muted"}`}
                              >
                                  <span>{item.label}</span>
                                  {isActive ? <Check className="h-4 w-4 text-admin-primary" /> : null}
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

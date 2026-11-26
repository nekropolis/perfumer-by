"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BatchCodeBrand } from "@/types/batch-code";
import { BATCH_CODE_OTHER_BRAND_SLUG } from "@/lib/batch-code-page-content";
import { groupBrandsByFirstLetter, orderedLettersWithBrands } from "@/lib/brand-letter-groups";
import { holdStorefrontTabBar } from "@/lib/body-scroll-lock";
import { siteBtnSecondary, siteInput } from "@/lib/site-ui-classes";

type Props = {
    brands: BatchCodeBrand[];
    value: string;
    onChangeAction: (slug: string) => void;
    disabled?: boolean;
    id?: string;
};

export default function BatchCodeBrandSelect({
    brands,
    value,
    onChangeAction,
    disabled = false,
    id,
}: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [portalReady, setPortalReady] = useState(false);
    const [activeLetter, setActiveLetter] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const selectedLabel = useMemo(() => {
        if (value === BATCH_CODE_OTHER_BRAND_SLUG) {
            return "Другой бренд";
        }
        return brands.find((b) => b.slug === value)?.name ?? "Выберите бренд";
    }, [brands, value]);

    const filteredBrands = useMemo(() => {
        const q = query.trim().toLowerCase();
        const visible = brands.filter((brand) => brand.primary !== false);
        if (!q) {
            return visible.filter((brand) => brand.support !== "not_supported");
        }
        return visible.filter((brand) => brand.name.toLowerCase().includes(q));
    }, [brands, query]);

    const brandGroups = useMemo(() => groupBrandsByFirstLetter(filteredBrands), [filteredBrands]);
    const letters = useMemo(() => orderedLettersWithBrands(brandGroups), [brandGroups]);

    useEffect(() => {
        setPortalReady(true);
    }, []);

    useEffect(() => {
        if (!open) {
            return;
        }
        setActiveLetter(letters[0] ?? null);
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
                setQuery("");
            }
        };
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("keydown", onKey);
        };
    }, [open, letters]);

    useEffect(() => {
        if (!open) {
            return;
        }
        return holdStorefrontTabBar();
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const scrollY = window.scrollY;
        const body = document.body;
        const previous = {
            position: body.style.position,
            top: body.style.top,
            left: body.style.left,
            right: body.style.right,
            width: body.style.width,
            overflow: body.style.overflow,
        };
        body.style.position = "fixed";
        body.style.top = `-${scrollY}px`;
        body.style.left = "0";
        body.style.right = "0";
        body.style.width = "100%";
        body.style.overflow = "hidden";
        return () => {
            body.style.position = previous.position;
            body.style.top = previous.top;
            body.style.left = previous.left;
            body.style.right = previous.right;
            body.style.width = previous.width;
            body.style.overflow = previous.overflow;
            window.scrollTo(0, scrollY);
        };
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const root = listRef.current;
        if (!root) {
            return;
        }
        const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-brand-letter]"));
        if (sections.length === 0) {
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                const letter = visible[0]?.target.getAttribute("data-brand-letter");
                if (letter) {
                    setActiveLetter(letter);
                }
            },
            { root, rootMargin: "0px 0px -65% 0px", threshold: [0, 0.25, 1] },
        );
        for (const section of sections) {
            observer.observe(section);
        }
        return () => observer.disconnect();
    }, [open, letters, query]);

    const close = () => {
        setOpen(false);
        setQuery("");
    };

    const pick = (slug: string) => {
        onChangeAction(slug);
        close();
    };

    const scrollToLetter = (letter: string) => {
        setActiveLetter(letter);
        const root = listRef.current;
        const target = root?.querySelector<HTMLElement>(`[data-brand-letter="${CSS.escape(letter)}"]`);
        if (!root || !target) {
            return;
        }
        const delta = target.getBoundingClientRect().top - root.getBoundingClientRect().top;
        root.scrollTo({ top: Math.max(0, root.scrollTop + delta - 4), behavior: "smooth" });
    };

    return (
        <>
            <button
                id={id}
                type="button"
                disabled={disabled}
                onClick={() => setOpen(true)}
                aria-expanded={open}
                aria-haspopup="dialog"
                suppressHydrationWarning
                className={`${siteBtnSecondary} w-full justify-between disabled:opacity-50`}
            >
                <span className="truncate text-left">{selectedLabel}</span>
                <span className="ml-3 shrink-0 text-admin-text-secondary" aria-hidden>
                    ▾
                </span>
            </button>

            {portalReady && open
                ? createPortal(
                      <div
                          className="fixed inset-x-0 top-0 z-[220] flex items-end justify-center overscroll-none bg-slate-900/40 p-0 max-md:bottom-[var(--storefront-tab-bar-height,0px)] sm:items-center sm:p-4 md:inset-0"
                          onClick={close}
                      >
                          <div
                              role="dialog"
                              aria-modal="true"
                              aria-label="Бренд"
                              className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-admin-border bg-admin-surface p-4 shadow-2xl sm:max-h-[min(92svh,720px)] sm:rounded-xl"
                              onClick={(event) => event.stopPropagation()}
                          >
                              <div className="mb-3 flex shrink-0 items-center justify-between">
                                  <div className="text-sm font-semibold text-admin-text">Бренд</div>
                                  <button
                                      type="button"
                                      onClick={close}
                                      className="rounded-2xl px-2 py-1 text-sm text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text"
                                  >
                                      Закрыть
                                  </button>
                              </div>

                              <input
                                  type="text"
                                  value={query}
                                  onChange={(event) => setQuery(event.target.value)}
                                  placeholder="Поиск бренда"
                                  autoComplete="off"
                                  autoCorrect="off"
                                  autoCapitalize="off"
                                  spellCheck={false}
                                  className={`${siteInput} mb-3 shrink-0`}
                              />

                              {letters.length > 0 ? (
                                  <div className="mb-3 flex shrink-0 flex-wrap gap-1 border-b border-admin-border pb-3">
                                      {letters.map((letter) => {
                                          const isActive = activeLetter === letter;
                                          return (
                                              <button
                                                  key={letter}
                                                  type="button"
                                                  onClick={() => scrollToLetter(letter)}
                                                  aria-current={isActive ? "true" : undefined}
                                                  className={`rounded-2xl border px-2.5 py-1.5 text-xs font-semibold transition ${
                                                      isActive
                                                          ? "border-admin-primary bg-admin-primary text-white"
                                                          : "border-admin-border bg-admin-surface text-admin-text hover:bg-admin-muted"
                                                  }`}
                                              >
                                                  {letter}
                                              </button>
                                          );
                                      })}
                                  </div>
                              ) : null}

                              <div
                                  ref={listRef}
                                  className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]"
                              >
                                  {!query.trim() ? (
                                      <p className="text-xs leading-relaxed text-admin-text-secondary">
                                          Показаны бренды с правилами. Начните вводить название, чтобы найти любой бренд
                                          каталога.
                                      </p>
                                  ) : null}

                                  {letters.map((letter) => (
                                      <div key={letter} data-brand-letter={letter} className="space-y-1">
                                          <div className="sticky top-0 z-10 bg-admin-surface py-1 text-xs font-semibold text-admin-text-secondary">
                                              {letter}
                                          </div>
                                          <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2 lg:grid-cols-3">
                                              {(brandGroups.get(letter) ?? []).map((brand) => {
                                                  const isActive = brand.slug === value;
                                                  return (
                                                      <button
                                                          key={brand.slug}
                                                          type="button"
                                                          onClick={() => pick(brand.slug)}
                                                          className={`flex w-full items-center gap-2 rounded-2xl px-2 py-1.5 text-left text-sm transition hover:bg-admin-muted ${
                                                              isActive
                                                                  ? "bg-admin-primary font-semibold text-white hover:bg-admin-primary"
                                                                  : "text-admin-text"
                                                          }`}
                                                      >
                                                          <span className="min-w-0 flex-1 truncate">{brand.name}</span>
                                                          {brand.support === "not_supported" ? (
                                                              <span
                                                                  className={`shrink-0 text-[11px] ${
                                                                      isActive ? "text-white/70" : "text-admin-text-muted"
                                                                  }`}
                                                              >
                                                                  не проверяем
                                                              </span>
                                                          ) : null}
                                                      </button>
                                                  );
                                              })}
                                          </div>
                                      </div>
                                  ))}

                                  {filteredBrands.length === 0 && query.trim() ? (
                                      <p className="px-2 py-2 text-sm text-admin-text-secondary">
                                          В списке нет совпадений — выберите «Другой бренд».
                                      </p>
                                  ) : null}
                              </div>

                              <button
                                  type="button"
                                  onClick={() => pick(BATCH_CODE_OTHER_BRAND_SLUG)}
                                  className={`mt-3 shrink-0 rounded-2xl border border-dashed px-3 py-2 text-left text-sm transition ${
                                      value === BATCH_CODE_OTHER_BRAND_SLUG
                                          ? "border-admin-primary bg-admin-primary/10 font-semibold text-admin-text"
                                          : "border-admin-border text-admin-text-secondary hover:bg-admin-muted hover:text-admin-text"
                                  }`}
                              >
                                  Другой бренд
                              </button>
                              <div className="mt-3 shrink-0 border-t border-admin-border pt-3 md:hidden">
                                  <button type="button" onClick={close} className={`${siteBtnSecondary} min-h-12 w-full`}>
                                      Закрыть
                                  </button>
                              </div>
                          </div>
                      </div>,
                      document.body,
                  )
                : null}
        </>
    );
}

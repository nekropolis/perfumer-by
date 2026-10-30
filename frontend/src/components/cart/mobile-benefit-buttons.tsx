"use client";

import { Check, ChevronRight, Tag } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/components/auth/auth-provider";
import { useCart } from "@/components/cart/cart-provider";
import {
    applyDiscountCard,
    applyGiftCertificate,
    clearDiscountCard,
    clearGiftCertificate,
    DiscountCardApplyError,
    GiftCertificateApplyError,
    normalizeGiftCertificateCodeInput,
} from "@/lib/cart-api";
import { formatMoneyRubText } from "@/lib/format-money-display";
import { siteBtnPrimary, siteBtnSecondary, siteInput } from "@/lib/site-ui-classes";

type ClearTarget = "gift" | "card" | null;

export default function MobileBenefitButtons() {
    const { cart, setCartState } = useCart();
    const { isAuthenticated } = useAuth();
    const [isPending, startTransition] = useTransition();
    const [open, setOpen] = useState(false);
    const [portalReady, setPortalReady] = useState(false);
    const [giftCode, setGiftCode] = useState("");
    const [giftHoneypot, setGiftHoneypot] = useState("");
    const [giftLastAttemptAt, setGiftLastAttemptAt] = useState(0);
    const [giftError, setGiftError] = useState("");
    const [cardNumber, setCardNumber] = useState("");
    const [cardError, setCardError] = useState("");
    const [cardConflict, setCardConflict] = useState<string | null>(null);
    const [confirmClear, setConfirmClear] = useState<ClearTarget>(null);
    const giftInputRef = useRef<HTMLInputElement>(null);
    const giftInputId = useId();
    const cardInputId = useId();
    const titleId = useId();

    const certificate = cart?.gift_certificate ?? null;
    const discountCard = cart?.discount_card ?? null;
    const giftValue = normalizeGiftCertificateCodeInput(giftCode);
    const cardValue = cardNumber.trim();
    const canApplyGift = !certificate && giftValue !== "";
    const canApplyCard = !discountCard && cardValue !== "";
    const hasApplied = Boolean(certificate || discountCard);

    useEffect(() => {
        setPortalReady(true);
    }, []);

    useEffect(() => {
        if (!open) {
            return;
        }
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const timer = window.setTimeout(() => {
            if (!certificate) {
                giftInputRef.current?.focus({ preventScroll: true });
            }
        }, 320);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.clearTimeout(timer);
        };
    }, [open, certificate]);

    if (!cart) {
        return null;
    }

    const statusLabel = [
        certificate
            ? `Сертификат ${certificate.code}${certificate.amount ? ` · ${formatMoneyRubText(certificate.amount)}` : ""}`
            : null,
        discountCard
            ? `Карта ${discountCard.number}${discountCard.discount_percent ? ` · ${discountCard.discount_percent}%` : ""}`
            : null,
    ]
        .filter(Boolean)
        .join(" · ");

    const closeSheet = () => {
        setOpen(false);
        setConfirmClear(null);
        setGiftError("");
        setCardError("");
        setCardConflict(null);
    };

    const applyFilled = () => {
        if (!canApplyGift && !canApplyCard) {
            return;
        }

        startTransition(async () => {
            let failed = false;
            let latestCart = cart;

            if (canApplyGift) {
                setGiftError("");
                if (giftHoneypot.trim() !== "") {
                    setGiftError("Не удалось применить сертификат");
                    failed = true;
                } else if (Date.now() - giftLastAttemptAt < 1500) {
                    setGiftError("Слишком частые попытки. Повторите через секунду.");
                    failed = true;
                } else {
                    setGiftLastAttemptAt(Date.now());
                    try {
                        const response = await applyGiftCertificate(giftValue);
                        latestCart = response.data;
                        setCartState(latestCart);
                        setGiftCode("");
                    } catch (error) {
                        setGiftError(
                            error instanceof GiftCertificateApplyError
                                ? error.message
                                : "Не удалось применить сертификат",
                        );
                        failed = true;
                    }
                }
            }

            if (canApplyCard) {
                setCardError("");
                const sessionOnly = cardConflict === cardValue;
                try {
                    const response = await applyDiscountCard(cardValue, sessionOnly);
                    latestCart = response.data;
                    setCartState(latestCart);
                    setCardConflict(null);
                    setCardNumber("");
                } catch (error) {
                    if (
                        error instanceof DiscountCardApplyError &&
                        error.code === "USER_ALREADY_HAS_DISCOUNT_CARD" &&
                        isAuthenticated
                    ) {
                        setCardConflict(cardValue);
                        failed = true;
                    } else {
                        setCardError(error instanceof Error ? error.message : "Не удалось применить карту");
                        failed = true;
                    }
                }
            }

            if (!failed) {
                closeSheet();
            }
        });
    };

    const clearApplied = (target: ClearTarget) => {
        if (!target) {
            return;
        }
        startTransition(async () => {
            if (target === "gift") {
                setGiftError("");
                const response = await clearGiftCertificate();
                setCartState(response.data);
                setGiftCode("");
            } else {
                const response = await clearDiscountCard();
                setCartState(response.data);
                setCardConflict(null);
                setCardError("");
                setCardNumber("");
            }
            setConfirmClear(null);
        });
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex w-full items-center gap-2 py-1.5 text-left active:opacity-80"
                aria-haspopup="dialog"
                aria-expanded={open}
            >
                <Tag className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
                <span
                    className={`min-w-0 flex-1 truncate text-[13px] leading-4 ${
                        hasApplied ? "font-medium text-emerald-700" : "text-admin-text-secondary"
                    }`}
                >
                    {statusLabel || "Сертификат / карта лояльности"}
                </span>
                {hasApplied ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden /> : null}
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-admin-text-secondary" aria-hidden />
            </button>

            {portalReady && open
                ? createPortal(
                      <div className="pointer-events-none fixed inset-0 z-[140] md:hidden" role="presentation">
                          <button
                              type="button"
                              aria-label="Отмена"
                              className="pointer-events-auto absolute inset-x-0 top-0 bg-slate-900/45"
                              style={{
                                  bottom:
                                      "calc(var(--storefront-tab-bar-height, 0px) + var(--storefront-keyboard-inset, 0px))",
                              }}
                              onClick={closeSheet}
                          />
                          <div
                              role="dialog"
                              aria-modal="true"
                              aria-labelledby={titleId}
                              data-storefront-keyboard-dock=""
                              data-storefront-keep-tab-bar=""
                              className="storefront-keyboard-sheet pointer-events-auto absolute inset-x-0 flex max-h-[min(78dvh,560px)] flex-col overflow-hidden rounded-t-3xl border border-admin-border bg-admin-surface shadow-2xl"
                              style={{
                                  bottom:
                                      "calc(var(--storefront-tab-bar-height, 0px) + var(--storefront-keyboard-overlap, 0px))",
                              }}
                          >
                              <div className="shrink-0 border-b border-admin-border px-4 py-3">
                                  <div id={titleId} className="text-base font-semibold text-admin-text">
                                      Сертификат и карта
                                  </div>
                              </div>

                              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 [-webkit-overflow-scrolling:touch]">
                                  {certificate ? (
                                      <AppliedRow
                                          label={`Сертификат ${certificate.code}${certificate.amount ? ` · ${formatMoneyRubText(certificate.amount)}` : ""}`}
                                          onRemove={() => setConfirmClear("gift")}
                                      />
                                  ) : (
                                      <Field
                                          id={giftInputId}
                                          label="Номер сертификата"
                                          placeholder="Введите код"
                                          value={giftCode}
                                          inputRef={giftInputRef}
                                          invalid={Boolean(giftError)}
                                          onChange={(value) => {
                                              setGiftCode(normalizeGiftCertificateCodeInput(value));
                                              setGiftError("");
                                          }}
                                      />
                                  )}

                                  {discountCard ? (
                                      <AppliedRow
                                          label={`Карта ${discountCard.number}${discountCard.discount_percent ? ` · ${discountCard.discount_percent}%` : ""}`}
                                          onRemove={() => setConfirmClear("card")}
                                      />
                                  ) : (
                                      <Field
                                          id={cardInputId}
                                          label="Карта лояльности"
                                          placeholder="Номер телефона или карты"
                                          value={cardNumber}
                                          invalid={Boolean(cardError)}
                                          onChange={(value) => {
                                              setCardNumber(value);
                                              setCardConflict(null);
                                              setCardError("");
                                          }}
                                      />
                                  )}

                                  <input
                                      type="text"
                                      value={giftHoneypot}
                                      onChange={(event) => setGiftHoneypot(event.target.value)}
                                      tabIndex={-1}
                                      autoComplete="off"
                                      aria-hidden="true"
                                      className="hidden"
                                  />

                                  {giftError ? <Message tone="error">{giftError}</Message> : null}
                                  {cardError ? <Message tone="error">{cardError}</Message> : null}
                                  {cardConflict ? (
                                      <Message tone="warning">
                                          Применить эту карту только к текущему заказу? Карта в профиле не изменится.
                                          Нажмите «Применить» ещё раз.
                                      </Message>
                                  ) : null}
                                  {confirmClear === "gift" && certificate ? (
                                      <Message tone="warning">
                                          <span>Убрать сертификат {certificate.code}?</span>
                                          <span className="mt-2 flex gap-2">
                                              <button
                                                  type="button"
                                                  onClick={() => setConfirmClear(null)}
                                                  className={`${siteBtnSecondary} flex-1`}
                                              >
                                                  Отмена
                                              </button>
                                              <button
                                                  type="button"
                                                  disabled={isPending}
                                                  onClick={() => clearApplied("gift")}
                                                  className={`${siteBtnPrimary} flex-1`}
                                              >
                                                  Убрать
                                              </button>
                                          </span>
                                      </Message>
                                  ) : null}
                                  {confirmClear === "card" && discountCard ? (
                                      <Message tone="warning">
                                          <span>Убрать карту {discountCard.number}?</span>
                                          <span className="mt-2 flex gap-2">
                                              <button
                                                  type="button"
                                                  onClick={() => setConfirmClear(null)}
                                                  className={`${siteBtnSecondary} flex-1`}
                                              >
                                                  Отмена
                                              </button>
                                              <button
                                                  type="button"
                                                  disabled={isPending}
                                                  onClick={() => clearApplied("card")}
                                                  className={`${siteBtnPrimary} flex-1`}
                                              >
                                                  Убрать
                                              </button>
                                          </span>
                                      </Message>
                                  ) : null}
                              </div>

                              <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-admin-border px-4 py-3">
                                  <button type="button" onClick={closeSheet} className={`${siteBtnSecondary} w-full`}>
                                      Отмена
                                  </button>
                                  <button
                                      type="button"
                                      disabled={isPending || (!canApplyGift && !canApplyCard)}
                                      onClick={applyFilled}
                                      className={`${siteBtnPrimary} w-full`}
                                  >
                                      {isPending ? "…" : "Применить"}
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

function Field({
    id,
    label,
    placeholder,
    value,
    invalid,
    inputRef,
    onChange,
}: {
    id: string;
    label: string;
    placeholder: string;
    value: string;
    invalid: boolean;
    inputRef?: RefObject<HTMLInputElement | null>;
    onChange: (value: string) => void;
}) {
    return (
        <div>
            <label htmlFor={id} className="mb-1.5 block text-sm text-admin-text">
                {label}
            </label>
            <input
                ref={inputRef}
                id={id}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                autoComplete="off"
                aria-invalid={invalid || undefined}
                className={siteInput}
            />
        </div>
    );
}

function AppliedRow({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <span className="flex min-w-0 items-center gap-1.5">
                <Check className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
            </span>
            <button
                type="button"
                onClick={onRemove}
                className="shrink-0 text-xs font-medium text-emerald-900 underline-offset-2 hover:underline"
            >
                Убрать
            </button>
        </div>
    );
}

function Message({ tone, children }: { tone: "error" | "warning"; children: ReactNode }) {
    const className =
        tone === "error"
            ? "rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
            : "rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800";
    return (
        <div role={tone === "error" ? "alert" : "status"} className={className}>
            {children}
        </div>
    );
}

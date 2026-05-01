"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
    ApiRequestError,
    fetchStoreReviews,
    submitStoreReview,
    type ReviewItem,
} from "@/lib/reviews-api";
import { executeRecaptchaV3, loadRecaptchaScript } from "@/lib/recaptcha-v3";
import { useReviewFormModalEffects } from "@/hooks/use-review-form-modal-effects";
import ReviewFormModal from "@/components/reviews/review-form-modal";

const RECAPTCHA_ACTION = "submit_review";
const MIN_TEXT = 15;
const MAX_TEXT = 4000;
const MIN_NAME = 2;
const MAX_NAME = 100;
const STORE_REVIEWS_PAGE_SIZE = 5;

type Props = {
    initialReviews: ReviewItem[];
    /** Модалка открывается с родителя (кнопка на странице) */
    formOpen?: boolean;
    onFormOpenChangeAction?: (open: boolean) => void;
    onSubmitSuccessMessageAction?: (message: string) => void;
    /** Скрыть карточку «Оставить отзыв» (кнопка вынесена в page) */
    hideHero?: boolean;
};

function formatReviewDate(iso: string | null): string {
    if (!iso) return "";
    try {
        return new Intl.DateTimeFormat("ru-RU", {
            day: "numeric",
            month: "long",
            year: "numeric",
        }).format(new Date(iso));
    } catch {
        return iso;
    }
}

export default function StoreReviewsView({
    initialReviews,
    formOpen: formOpenProp,
    onFormOpenChangeAction,
    onSubmitSuccessMessageAction,
    hideHero = false,
}: Props) {
    const router = useRouter();
    const formId = useId();
    const nameId = `${formId}-name`;
    const textId = `${formId}-text`;
    const firstFieldRef = useRef<HTMLInputElement>(null);

    const [reviews, setReviews] = useState<ReviewItem[]>(initialReviews);
    const [listLoading, setListLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const nextOffsetRef = useRef(initialReviews.length);
    const hasMoreRef = useRef(initialReviews.length === STORE_REVIEWS_PAGE_SIZE);
    const loadingMoreRef = useRef(false);
    const sentinelRef = useRef<HTMLDivElement | null>(null);

    const isFormControlled = typeof onFormOpenChangeAction === "function";
    const [internalFormOpen, setInternalFormOpen] = useState(false);
    const formOpen = isFormControlled ? Boolean(formOpenProp) : internalFormOpen;

    const setFormOpen = useCallback(
        (open: boolean) => {
            if (isFormControlled) {
                onFormOpenChangeAction?.(open);
            } else {
                setInternalFormOpen(open);
            }
        },
        [isFormControlled, onFormOpenChangeAction],
    );
    const [name, setName] = useState("");
    const [text, setText] = useState("");
    const [stars, setStars] = useState(5);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitOk, setSubmitOk] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim() || "";

    useEffect(() => {
        setReviews(initialReviews);
        nextOffsetRef.current = initialReviews.length;
        hasMoreRef.current = initialReviews.length === STORE_REVIEWS_PAGE_SIZE;
    }, [initialReviews]);

    const reload = useCallback(() => {
        setListLoading(true);
        fetchStoreReviews(STORE_REVIEWS_PAGE_SIZE, 0)
            .then((res) => {
                const data = res.data ?? [];
                setReviews(data);
                nextOffsetRef.current = data.length;
                hasMoreRef.current = data.length === STORE_REVIEWS_PAGE_SIZE;
            })
            .catch(() => {
                /* ignore */
            })
            .finally(() => setListLoading(false));
    }, []);

    const loadMore = useCallback(async () => {
        if (!hasMoreRef.current || loadingMoreRef.current) {
            return;
        }
        loadingMoreRef.current = true;
        setLoadingMore(true);
        try {
            const res = await fetchStoreReviews(STORE_REVIEWS_PAGE_SIZE, nextOffsetRef.current);
            const batch = res.data ?? [];
            if (batch.length === 0) {
                hasMoreRef.current = false;
                return;
            }
            setReviews((prev) => {
                const seen = new Set(prev.map((r) => r.id));
                const merged = batch.filter((r) => !seen.has(r.id));
                return merged.length ? [...prev, ...merged] : prev;
            });
            nextOffsetRef.current += batch.length;
            hasMoreRef.current = batch.length === STORE_REVIEWS_PAGE_SIZE;
        } catch {
            /* ignore */
        } finally {
            loadingMoreRef.current = false;
            setLoadingMore(false);
        }
    }, []);

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) {
            return;
        }
        const obs = new IntersectionObserver(
            (entries) => {
                if (!entries.some((e) => e.isIntersecting)) {
                    return;
                }
                void loadMore();
            },
            { root: null, rootMargin: "200px 0px", threshold: 0 },
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [loadMore]);

    const closeForm = useCallback(() => setFormOpen(false), [setFormOpen]);

    useReviewFormModalEffects({
        isOpen: formOpen,
        onRequestClose: closeForm,
        siteKey: recaptchaSiteKey,
        focusRef: firstFieldRef,
    });

    const openForm = () => {
        if (!hideHero) {
            setSubmitOk(null);
        }
        setSubmitError(null);
        setFieldErrors({});
        setFormOpen(true);
    };

    const validateForm = useCallback((): boolean => {
        const next: Record<string, string> = {};
        const n = name.trim();
        const t = text.trim();
        if (n.length < MIN_NAME) {
            next.name = `Имя — не менее ${MIN_NAME} символов.`;
        } else if (n.length > MAX_NAME) {
            next.name = `Имя — не более ${MAX_NAME} символов.`;
        }
        if (t.length < MIN_TEXT) {
            next.text = `Текст отзыва — не менее ${MIN_TEXT} символов.`;
        } else if (t.length > MAX_TEXT) {
            next.text = `Текст отзыва — не более ${MAX_TEXT} символов.`;
        }
        if (stars < 1 || stars > 5) {
            next.stars = "Выберите оценку от 1 до 5.";
        }
        setFieldErrors(next);
        return Object.keys(next).length === 0;
    }, [name, text, stars]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        if (!hideHero) {
            setSubmitOk(null);
        }
        if (!validateForm()) {
            return;
        }

        setSubmitting(true);
        try {
            let captchaToken: string | undefined;
            if (recaptchaSiteKey) {
                await loadRecaptchaScript(recaptchaSiteKey);
                captchaToken = await executeRecaptchaV3(recaptchaSiteKey, RECAPTCHA_ACTION);
                if (!captchaToken) {
                    setSubmitError("Не удалось получить токен защиты. Обновите страницу и попробуйте снова.");
                    setSubmitting(false);
                    return;
                }
            }

            const res = await submitStoreReview({
                name: name.trim(),
                text: text.trim(),
                stars,
                captchaToken,
            });
            if (hideHero && onSubmitSuccessMessageAction) {
                onSubmitSuccessMessageAction(res.message);
            } else {
                setSubmitOk(res.message);
            }
            setName("");
            setText("");
            setStars(5);
            setFormOpen(false);
            router.refresh();
            reload();
        } catch (err) {
            if (err instanceof ApiRequestError) {
                setSubmitError(err.message);
            } else {
                setSubmitError("Не удалось отправить отзыв.");
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-10">
            {!hideHero ? (
                <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                        <div className="min-w-0 flex-1 space-y-2">
                            <h2 className="text-lg font-semibold text-[var(--foreground)]">Оставить отзыв о магазине</h2>
                            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                                Поделитесь впечатлением о сервисе, доставке или ассортименте. Отзыв появится после проверки модератором.
                            </p>
                        </div>
                        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:items-end sm:pt-0.5">
                            <button
                                type="button"
                                onClick={openForm}
                                className="w-full rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 sm:w-auto"
                            >
                                Написать отзыв
                            </button>
                            {submitOk ? (
                                <p className="text-sm text-emerald-700 sm:max-w-xs sm:text-right">{submitOk}</p>
                            ) : null}
                        </div>
                    </div>
                </section>
            ) : null}

            <section
                {...(hideHero
                    ? { "aria-label": "Опубликованные отзывы" }
                    : { "aria-labelledby": `${formId}-list-title` })}
            >
                <div
                    className={`mb-4 flex flex-wrap items-end gap-3 ${hideHero ? "justify-end" : "justify-between"}`}
                >
                    {!hideHero ? (
                        <h2 id={`${formId}-list-title`} className="text-lg font-semibold text-[var(--foreground)]">
                            Отзывы покупателей
                        </h2>
                    ) : null}
                    {listLoading && <span
                        className="text-sm text-[var(--accent)] underline-offset-2 hover:underline disabled:opacity-50"
                    >Обновление…</span>}
                </div>

                {reviews.length === 0 ? (
                    <p className="text-sm text-[var(--text-secondary)]">Пока нет опубликованных отзывов.</p>
                ) : (
                    <ul className="space-y-5">
                        {reviews.map((item) => (
                            <li
                                key={item.id}
                                className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"
                            >
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-sm font-semibold text-[var(--foreground)]">{item.name}</span>
                                    <span className="text-xs text-[var(--text-secondary)]">{formatReviewDate(item.created_at)}</span>
                                </div>
                                <div className="mb-2 flex gap-0.5 text-amber-500" aria-hidden>
                                    {Array.from({ length: 5 }, (_, i) => (
                                        <Star
                                            key={i}
                                            className="h-4 w-4"
                                            fill={i < item.stars ? "currentColor" : "none"}
                                            strokeWidth={i < item.stars ? 0 : 1.5}
                                        />
                                    ))}
                                </div>
                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">{item.text}</p>

                                {item.reply?.text ? (
                                    <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--background)] p-4">
                                        <div className="mb-1 text-xs font-medium text-[var(--text-secondary)]">
                                            Ответ магазина
                                        </div>
                                        {item.reply.replied_at ? (
                                            <p className="mb-2 text-xs text-[var(--text-secondary)]">
                                                {formatReviewDate(item.reply.replied_at)}
                                            </p>
                                        ) : null}
                                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">{item.reply.text}</p>
                                    </div>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
                {reviews.length > 0 ? (
                    <div ref={sentinelRef} className="h-px w-full" aria-hidden />
                ) : null}
                {loadingMore ? (
                    <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">Загрузка отзывов…</p>
                ) : null}
            </section>

            <ReviewFormModal
                open={formOpen}
                onCloseAction={closeForm}
                onSubmitAction={handleSubmit}
                titleId={`${formId}-title`}
                modalTitle="Отзыв о магазине"
                modalSubtitle="После отправки отзыв пройдёт модерацию и появится в списке ниже."
                name={name}
                onNameChangeAction={setName}
                nameId={nameId}
                nameInputRef={firstFieldRef}
                text={text}
                onTextChangeAction={setText}
                textId={textId}
                stars={stars}
                onStarsChangeAction={setStars}
                fieldErrors={fieldErrors}
                submitError={submitError}
                submitting={submitting}
                maxName={MAX_NAME}
                maxText={MAX_TEXT}
            />
        </div>
    );
}

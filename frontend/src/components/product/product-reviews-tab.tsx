"use client";

import { Star } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
    ApiRequestError,
    fetchProductReviews,
    submitProductReview,
} from "@/lib/reviews-api";
import type { ReviewItem } from "@/types/reviews";
import { executeRecaptchaV3, loadRecaptchaScript } from "@/lib/recaptcha-v3";
import { useReviewFormModalEffects } from "@/hooks/use-review-form-modal-effects";
import ReviewFormModal from "@/components/reviews/review-form-modal";
import { formatReviewDateRu, normalizeReviewItem } from "@/lib/review-text-display";

const RECAPTCHA_ACTION = "submit_review";
const MIN_TEXT = 15;
const MAX_TEXT = 4000;
const MIN_NAME = 2;
const MAX_NAME = 100;

type Props = {
    productId: number;
    isActive: boolean;
    /** SSR: начальное состояние списка (дублирование в HTML для SEO — в `page.tsx`, `ProductReviewsSeoHtml`). */
    initialReviews?: ReviewItem[];
};

export default function ProductReviewsTab({ productId, isActive, initialReviews }: Props) {
    const formId = useId();
    const nameId = `${formId}-name`;
    const textId = `${formId}-text`;
    const firstFieldRef = useRef<HTMLInputElement>(null);

    const [reviews, setReviews] = useState<ReviewItem[]>(() =>
        (initialReviews ?? []).map(normalizeReviewItem),
    );
    const [listLoading, setListLoading] = useState(false);
    const [listError, setListError] = useState<string | null>(null);

    const [formOpen, setFormOpen] = useState(false);
    const [name, setName] = useState("");
    const [text, setText] = useState("");
    const [stars, setStars] = useState<number>(5);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitOk, setSubmitOk] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim() || "";

    const reloadList = useCallback(() => {
        setListLoading(true);
        setListError(null);
        fetchProductReviews(productId)
            .then((res) => setReviews(res.data.map(normalizeReviewItem)))
            .catch((e: unknown) => {
                setListError(e instanceof Error ? e.message : "Ошибка загрузки");
            })
            .finally(() => setListLoading(false));
    }, [productId]);

    useEffect(() => {
        setReviews((initialReviews ?? []).map(normalizeReviewItem));
    }, [productId, initialReviews]);

    useEffect(() => {
        if (!isActive) {
            return;
        }
        void reloadList();
    }, [isActive, productId, reloadList]);

    const closeForm = useCallback(() => setFormOpen(false), []);

    useReviewFormModalEffects({
        isOpen: formOpen,
        onRequestClose: closeForm,
        siteKey: recaptchaSiteKey,
        focusRef: firstFieldRef,
    });

    const openForm = () => {
        setSubmitOk(null);
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
        setSubmitOk(null);
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

            const res = await submitProductReview({
                productId,
                name: name.trim(),
                text: text.trim(),
                stars,
                captchaToken,
            });
            setSubmitOk(res.message);
            setName("");
            setText("");
            setStars(5);
            setFormOpen(false);
            reloadList();
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

    if (!isActive) {
        return null;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                <p className="max-w-xl text-sm text-[var(--text-secondary)]">
                    Опубликованные оценки и комментарии. Новый отзыв появится после модерации.
                </p>
                <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:items-end">
                    <button
                        type="button"
                        onClick={openForm}
                        className="w-full rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 sm:w-auto"
                    >
                        Написать отзыв
                    </button>
                    {submitOk ? <p className="text-sm text-emerald-700 sm:text-right">{submitOk}</p> : null}
                </div>
            </div>

            <div>
                {listLoading ? (
                    <p className="text-sm text-[var(--text-secondary)]">Загрузка…</p>
                ) : listError ? (
                    <p className="text-sm text-red-600">{listError}</p>
                ) : reviews.length === 0 ? (
                    <p className="text-sm text-[var(--text-secondary)]">
                        Отзывов пока нет. Будьте первым.
                    </p>
                ) : (
                    <ul className="space-y-4">
                        {reviews.map((item) => (
                            <li
                                key={item.id}
                                className="rounded-2xl border border-[var(--line)] bg-[var(--background)] p-4"
                            >
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-[var(--foreground)]">{item.name}</span>
                                    <span className="text-xs text-[var(--text-secondary)]">{formatReviewDateRu(item.created_at)}</span>
                                </div>
                                <div className="mb-2 flex gap-0.5 text-amber-400" aria-hidden>
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
                                    <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                                        <div className="mb-1 text-xs font-medium text-[var(--text-secondary)]">
                                            Ответ магазина
                                        </div>
                                        {item.reply.replied_at ? (
                                            <p className="mb-1 text-xs text-[var(--text-secondary)]">
                                                {formatReviewDateRu(item.reply.replied_at)}
                                            </p>
                                        ) : null}
                                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">
                                            {item.reply.text}
                                        </p>
                                    </div>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <ReviewFormModal
                open={formOpen}
                onCloseAction={closeForm}
                onSubmitAction={handleSubmit}
                titleId={`${formId}-title`}
                modalTitle="Отзыв о товаре"
                modalSubtitle="После отправки отзыв пройдёт модерацию и появится в списке выше."
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

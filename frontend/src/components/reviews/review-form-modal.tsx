"use client";

import { Star, X } from "lucide-react";
import type { FormEventHandler, RefObject } from "react";
import RecaptchaNotice from "@/components/ui/recaptcha-notice";
import { siteBtnPrimary, siteBtnSecondary, siteCard, siteInput } from "@/lib/site-ui-classes";

export type ReviewFormFieldErrors = {
    name?: string;
    text?: string;
    stars?: string;
};

type Props = {
    open: boolean;
    onCloseAction: () => void;
    onSubmitAction: FormEventHandler<HTMLFormElement>;
    titleId: string;
    modalTitle: string;
    modalSubtitle: string;
    name: string;
    onNameChangeAction: (value: string) => void;
    nameId: string;
    nameInputRef?: RefObject<HTMLInputElement | null>;
    text: string;
    onTextChangeAction: (value: string) => void;
    textId: string;
    stars: number;
    onStarsChangeAction: (value: number) => void;
    fieldErrors: ReviewFormFieldErrors;
    submitError: string | null;
    submitting: boolean;
    maxName: number;
    maxText: number;
    showRecaptchaNotice?: boolean;
};

export default function ReviewFormModal({
    open,
    onCloseAction,
    onSubmitAction,
    titleId,
    modalTitle,
    modalSubtitle,
    name,
    onNameChangeAction,
    nameId,
    nameInputRef,
    text,
    onTextChangeAction,
    textId,
    stars,
    onStarsChangeAction,
    fieldErrors,
    submitError,
    submitting,
    maxName,
    maxText,
    showRecaptchaNotice = false,
}: Props) {
    if (!open) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center"
            onClick={onCloseAction}
            role="presentation"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={`${siteCard} max-h-[min(90vh,640px)] w-full max-w-lg overflow-y-auto p-5 shadow-xl sm:p-6`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                        <h2 id={titleId} className="text-lg font-semibold text-admin-text">
                            {modalTitle}
                        </h2>
                        <p className="mt-1 text-xs text-admin-text-secondary">{modalSubtitle}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onCloseAction}
                        className="shrink-0 rounded-lg border border-admin-border p-2 text-admin-text-secondary transition hover:bg-admin-muted hover:text-admin-text"
                        aria-label="Закрыть"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={onSubmitAction} className="space-y-4" noValidate>
                    <div>
                        <label htmlFor={nameId} className="mb-1 block text-xs text-admin-text-secondary">
                            Имя
                        </label>
                        <input
                            ref={nameInputRef}
                            id={nameId}
                            type="text"
                            autoComplete="name"
                            value={name}
                            onChange={(ev) => onNameChangeAction(ev.target.value)}
                            maxLength={maxName}
                            className={siteInput}
                        />
                        {fieldErrors.name ? <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p> : null}
                    </div>

                    <div>
                        <span className="mb-1 block text-xs text-admin-text-secondary">Оценка</span>
                        <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => onStarsChangeAction(value)}
                                    className="rounded-lg p-1 text-amber-500 transition hover:bg-amber-50"
                                    aria-label={`${value} из 5`}
                                >
                                    <Star
                                        className="h-7 w-7"
                                        fill={value <= stars ? "currentColor" : "none"}
                                        strokeWidth={value <= stars ? 0 : 1.5}
                                    />
                                </button>
                            ))}
                        </div>
                        {fieldErrors.stars ? <p className="mt-1 text-xs text-red-600">{fieldErrors.stars}</p> : null}
                    </div>

                    <div>
                        <label htmlFor={textId} className="mb-1 block text-xs text-admin-text-secondary">
                            Отзыв
                        </label>
                        <textarea
                            id={textId}
                            value={text}
                            onChange={(ev) => onTextChangeAction(ev.target.value)}
                            rows={5}
                            maxLength={maxText}
                            className={siteInput}
                        />
                        <div className="mt-1 flex justify-between text-xs text-admin-text-secondary">
                            <span>{text.trim().length}/{maxText}</span>
                            {fieldErrors.text ? <span className="text-red-600">{fieldErrors.text}</span> : null}
                        </div>
                    </div>

                    {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}

                    <div className="flex flex-wrap gap-2 pt-1">
                        <button type="submit" disabled={submitting} className={siteBtnPrimary}>
                            {submitting ? "Отправка…" : "Отправить отзыв"}
                        </button>
                        <button type="button" onClick={onCloseAction} className={siteBtnSecondary}>
                            Отмена
                        </button>
                    </div>
                    {showRecaptchaNotice ? (
                        <RecaptchaNotice className="pt-1 text-[10px] leading-4 text-admin-text-secondary" />
                    ) : null}
                </form>
            </div>
        </div>
    );
}

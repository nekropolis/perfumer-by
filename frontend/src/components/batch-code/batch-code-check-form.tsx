"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useId, useState, type FormEventHandler } from "react";
import BatchCodeBrandSelect from "@/components/batch-code/batch-code-brand-select";
import {
    BatchCodeRequestError,
    checkBatchCode,
    firstBatchCodeValidationMessage,
    submitBatchCodeFeedback,
} from "@/lib/batch-code-api";
import {
    batchCodeConfidenceLabel,
    formatBatchCodeDateLabel,
    formatBatchCodePeriod,
} from "@/lib/batch-code-dates";
import { BATCH_CODE_OTHER_BRAND_SLUG } from "@/lib/batch-code-page-content";
import {
    siteBtnPrimary,
    siteBtnSecondary,
    siteCard,
    siteCheckbox,
    siteInput,
    siteSelect,
} from "@/lib/site-ui-classes";
import type { BatchCodeBrand, BatchCodeCheckData, BatchCodeDateKind } from "@/types/batch-code";

const RESULT_DISCLAIMER =
    "Результат носит справочный характер и не подтверждает подлинность товара. Отсутствие даты не означает, что аромат подделка.";

type Props = {
    brands: BatchCodeBrand[];
};

function notSupportedResult(): BatchCodeCheckData {
    return {
        status: "not_supported",
        brand: null,
        code_normalized: "",
        result: null,
        confidence: null,
        period_note: null,
        official_url: null,
        rule_id: null,
        sources: [],
    };
}

function BatchCodeResultPanel({ data, codeRaw }: { data: BatchCodeCheckData; codeRaw: string }) {
    const confidence = batchCodeConfidenceLabel(data.confidence);
    const period = data.result
        ? formatBatchCodePeriod({
              date_from: data.result.date_from,
              date_to: data.result.date_to,
              precision: data.result.precision,
          })
        : null;
    const candidates = data.result?.candidates?.filter(Boolean) ?? [];

    return (
        <div className={`${siteCard} mt-4 space-y-3 p-4 sm:p-5`} aria-live="polite">
            {data.status === "approximate" ? (
                <>
                    <p className="text-sm font-semibold text-admin-text">
                        {period ? (
                            <>
                                Ориентировочно: <span className="font-normal">{period}</span>
                            </>
                        ) : (
                            "Ориентировочная дата по коду"
                        )}
                    </p>
                    {confidence ? (
                        <p className="text-xs text-admin-text-secondary">{confidence}</p>
                    ) : null}
                    {data.period_note?.trim() ? (
                        <p className="text-sm text-admin-text-secondary">{data.period_note.trim()}</p>
                    ) : null}
                    {candidates.length > 0 ? (
                        <ul className="list-inside list-disc text-sm text-admin-text-secondary">
                            {candidates.map((item) => (
                                <li key={item}>{formatBatchCodeDateLabel(item, data.result?.precision ?? "month")}</li>
                            ))}
                        </ul>
                    ) : null}
                    {data.sources.length > 0 ? (
                        <details className="rounded-xl border border-admin-border bg-admin-muted/30 px-3 py-2">
                            <summary className="cursor-pointer text-sm font-medium text-admin-text">
                                Источники и правила
                            </summary>
                            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-admin-text-secondary">
                                {data.sources.map((source) => (
                                    <li key={source}>{source}</li>
                                ))}
                            </ul>
                        </details>
                    ) : null}
                </>
            ) : null}

            {data.status === "format_recognized" ? (
                <p className="text-sm text-admin-text">
                    Формат кода распознан, дату по нему надёжно определить нельзя.
                </p>
            ) : null}

            {data.status === "manufacturer_portal" ? (
                <div className="space-y-3">
                    <p className="text-sm text-admin-text">
                        Для этого бренда дату удобнее уточнить на официальном ресурсе производителя.
                    </p>
                    {data.official_url?.trim() ? (
                        <a
                            href={data.official_url.trim()}
                            target="_blank"
                            rel="nofollow noopener noreferrer"
                            className={siteBtnSecondary}
                        >
                            Открыть сайт производителя
                        </a>
                    ) : null}
                </div>
            ) : null}

            {data.status === "not_supported" ? (
                <p className="text-sm text-admin-text">
                    Пока мы не умеем расшифровывать код для выбранного бренда. Это не признак подделки — напишите
                    нам, мы добавим бренд в базу.
                </p>
            ) : null}

            {data.status === "invalid_format" ? (
                <p className="text-sm text-admin-text">
                    Не удалось разобрать код. Проверьте, что ввели символы с дна флакона или коробки без лишних
                    пробелов. Код на коробке и на флаконе должен совпадать.
                </p>
            ) : null}

            {data.code_normalized?.trim() && data.code_normalized !== codeRaw.trim() ? (
                <p className="text-xs text-admin-text-muted">
                    Нормализованный код: <span className="font-mono">{data.code_normalized}</span>
                </p>
            ) : null}

            <p className="text-xs leading-relaxed text-admin-text-muted">{RESULT_DISCLAIMER}</p>
        </div>
    );
}

function BatchCodeFeedbackForm({
    brandSlug,
    code,
    brandName,
}: {
    brandSlug: string;
    code: string;
    brandName: string;
}) {
    const [open, setOpen] = useState(false);
    const [printedDate, setPrintedDate] = useState("");
    const [useFullDate, setUseFullDate] = useState(false);
    const [dateKind, setDateKind] = useState<BatchCodeDateKind>("production");
    const [email, setEmail] = useState("");
    const [consent, setConsent] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [feedbackError, setFeedbackError] = useState<string | null>(null);
    const [feedbackSuccess, setFeedbackSuccess] = useState(false);

    const onSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
        event.preventDefault();
        setFeedbackError(null);

        if (!printedDate.trim()) {
            setFeedbackError("Укажите дату с упаковки");
            return;
        }
        if (!consent) {
            setFeedbackError("Подтвердите согласие на обработку персональных данных");
            return;
        }

        setSubmitting(true);
        try {
            await submitBatchCodeFeedback({
                brand_slug: brandSlug,
                code,
                printed_date: printedDate,
                date_kind: dateKind,
                consent: true,
                email: email.trim() || undefined,
            });
            setFeedbackSuccess(true);
        } catch (error) {
            if (error instanceof BatchCodeRequestError) {
                setFeedbackError(firstBatchCodeValidationMessage(error));
            } else {
                setFeedbackError("Не удалось отправить данные. Попробуйте позже.");
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="mt-4">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-admin-border bg-admin-surface px-4 py-3 text-left text-sm font-medium text-admin-text transition hover:bg-admin-muted/50"
                aria-expanded={open}
            >
                Помогите улучшить проверку
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-admin-text-secondary transition-transform ${open ? "rotate-180" : ""}`}
                    aria-hidden
                />
            </button>

            {open ? (
                <div className={`${siteCard} mt-2 p-4 sm:p-5`}>
                    {feedbackSuccess ? (
                        <p className="text-sm text-admin-text">Спасибо! Данные отправлены.</p>
                    ) : (
                        <form onSubmit={onSubmit} className="space-y-4" noValidate>
                            <p className="text-xs text-admin-text-secondary">
                                Бренд: <span className="text-admin-text">{brandName}</span>, код:{" "}
                                <span className="font-mono text-admin-text">{code}</span>
                            </p>

                            <div>
                                <label className="mb-1 block text-xs text-admin-text-secondary">
                                    Дата на упаковке
                                </label>
                                <input
                                    type={useFullDate ? "date" : "month"}
                                    value={printedDate}
                                    onChange={(e) => setPrintedDate(e.target.value)}
                                    className={siteInput}
                                    required
                                />
                                <label className="mt-2 flex items-center gap-2 text-xs text-admin-text-secondary">
                                    <input
                                        type="checkbox"
                                        checked={useFullDate}
                                        onChange={(e) => {
                                            setUseFullDate(e.target.checked);
                                            setPrintedDate("");
                                        }}
                                        className={siteCheckbox}
                                    />
                                    Указан точный день
                                </label>
                            </div>

                            <div>
                                <label htmlFor="batch-date-kind" className="mb-1 block text-xs text-admin-text-secondary">
                                    Тип даты
                                </label>
                                <select
                                    id="batch-date-kind"
                                    value={dateKind}
                                    onChange={(e) => setDateKind(e.target.value as BatchCodeDateKind)}
                                    className={siteSelect}
                                >
                                    <option value="production">Дата производства / изготовления</option>
                                    <option value="expiry">Срок годности / «использовать до»</option>
                                </select>
                            </div>

                            <div>
                                <label htmlFor="batch-feedback-email" className="mb-1 block text-xs text-admin-text-secondary">
                                    Email (необязательно)
                                </label>
                                <input
                                    id="batch-feedback-email"
                                    type="email"
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className={siteInput}
                                />
                            </div>

                            <label className="flex items-start gap-2 text-xs leading-relaxed text-admin-text-secondary">
                                <input
                                    type="checkbox"
                                    checked={consent}
                                    onChange={(e) => setConsent(e.target.checked)}
                                    className={`${siteCheckbox} mt-0.5`}
                                    required
                                />
                                <span>
                                    Даю согласие на обработку персональных данных в соответствии с{" "}
                                    <Link
                                        href="/politika-obrabotki-personalnyh-dannyh"
                                        className="text-admin-primary underline-offset-2 hover:underline"
                                    >
                                        политикой
                                    </Link>
                                    .
                                </span>
                            </label>

                            {feedbackError ? (
                                <p className="text-xs text-red-600" role="alert">
                                    {feedbackError}
                                </p>
                            ) : null}

                            <button type="submit" disabled={submitting} className={siteBtnPrimary}>
                                {submitting ? "Отправка…" : "Отправить"}
                            </button>
                        </form>
                    )}
                </div>
            ) : null}
        </div>
    );
}

export default function BatchCodeCheckForm({ brands }: Props) {
    const formId = useId();
    const brandFieldId = `${formId}-brand`;
    const codeFieldId = `${formId}-code`;

    const [brandSlug, setBrandSlug] = useState("");
    const [code, setCode] = useState("");
    const [checking, setChecking] = useState(false);
    const [checkError, setCheckError] = useState<string | null>(null);
    const [result, setResult] = useState<BatchCodeCheckData | null>(null);
    const [lastCode, setLastCode] = useState("");

    const selectedBrandName =
        brandSlug === BATCH_CODE_OTHER_BRAND_SLUG
            ? "Другой бренд"
            : (brands.find((b) => b.slug === brandSlug)?.name ?? "Бренд");

    const onSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
        event.preventDefault();
        setCheckError(null);
        setResult(null);

        if (!brandSlug) {
            setCheckError("Выберите бренд");
            return;
        }
        if (!code.trim()) {
            setCheckError("Введите батч-код");
            return;
        }

        setChecking(true);
        setLastCode(code.trim());

        try {
            if (brandSlug === BATCH_CODE_OTHER_BRAND_SLUG) {
                setResult(notSupportedResult());
                return;
            }

            const data = await checkBatchCode(brandSlug, code);
            setResult(data);
        } catch (error) {
            if (error instanceof BatchCodeRequestError) {
                setCheckError(firstBatchCodeValidationMessage(error));
            } else {
                setCheckError("Не удалось выполнить проверку. Попробуйте позже.");
            }
        } finally {
            setChecking(false);
        }
    };

    return (
        <section className={`${siteCard} p-4 sm:p-5`} aria-labelledby={`${formId}-heading`}>
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <h2 id={`${formId}-heading`} className="text-lg font-semibold text-admin-text">
                    Проверить код
                </h2>
                <span className="inline-flex rounded-full border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-900">
                    Бета
                </span>
            </div>

            <form onSubmit={onSubmit} className="space-y-4" noValidate>
                <div>
                    <label htmlFor={brandFieldId} className="mb-1 block text-xs text-admin-text-secondary">
                        Бренд
                    </label>
                    <BatchCodeBrandSelect
                        id={brandFieldId}
                        brands={brands}
                        value={brandSlug}
                        onChangeAction={setBrandSlug}
                        disabled={checking}
                    />
                </div>

                <div>
                    <label htmlFor={codeFieldId} className="mb-1 block text-xs text-admin-text-secondary">
                        Батч-код
                    </label>
                    <input
                        id={codeFieldId}
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className={siteInput}
                        placeholder="Например, 5F01"
                        autoComplete="off"
                        spellCheck={false}
                        disabled={checking}
                    />
                </div>

                {checkError ? (
                    <p className="text-xs text-red-600" role="alert">
                        {checkError}
                    </p>
                ) : null}

                <button type="submit" disabled={checking} className={siteBtnPrimary}>
                    {checking ? "Проверяем…" : "Проверить"}
                </button>
            </form>

            {result ? (
                <>
                    <BatchCodeResultPanel data={result} codeRaw={lastCode} />
                    <BatchCodeFeedbackForm
                        brandSlug={
                            result.brand?.slug ??
                            (brandSlug === BATCH_CODE_OTHER_BRAND_SLUG ? "other" : brandSlug)
                        }
                        code={lastCode}
                        brandName={result.brand?.name ?? selectedBrandName}
                    />
                </>
            ) : null}
        </section>
    );
}

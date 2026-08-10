"use client";

import Link from "next/link";
import { LEGAL_PAGE_PATHS } from "@/lib/legal-links";
import { siteBtnPrimary, siteBtnSecondary, siteCard } from "@/lib/site-ui-classes";
import { useCookieConsent } from "@/components/legal/cookie-consent-provider";

export default function CookieConsentBanner() {
    const { ready, choice, acceptAll, rejectOptional } = useCookieConsent();

    if (!ready || choice) {
        return null;
    }

    return (
        <div
            className="fixed inset-x-0 bottom-0 z-[80] p-3 sm:p-4"
            role="dialog"
            aria-labelledby="cookie-consent-title"
            aria-describedby="cookie-consent-desc"
        >
            <div
                className={`${siteCard} mx-auto flex max-w-3xl flex-col gap-3 p-4 shadow-lg sm:flex-row sm:items-end sm:gap-4 sm:p-5`}
            >
                <div className="min-w-0 flex-1">
                    <div id="cookie-consent-title" className="text-sm font-semibold text-admin-text">
                        Файлы cookie
                    </div>
                    <p
                        id="cookie-consent-desc"
                        className="mt-1 text-sm leading-relaxed text-admin-text-secondary"
                    >
                        Мы используем необходимые cookie для работы сайта (корзина, сессия).
                        Аналитические cookie — только с вашего согласия. Подробнее — в{" "}
                        <Link
                            href={LEGAL_PAGE_PATHS.cookies}
                            className="font-medium text-admin-primary underline-offset-2 hover:underline"
                        >
                            политике cookies
                        </Link>
                        .
                    </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <button type="button" onClick={rejectOptional} className={`${siteBtnSecondary} w-full sm:w-auto`}>
                        Только необходимые
                    </button>
                    <button type="button" onClick={acceptAll} className={`${siteBtnPrimary} w-full sm:w-auto`}>
                        Принять все
                    </button>
                </div>
            </div>
        </div>
    );
}

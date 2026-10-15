"use client";

type Props = {
    className?: string;
};

export default function RecaptchaNotice({ className }: Props) {
    return (
        <p className={className ?? "text-xs text-[var(--text-secondary)]"}>
            Этот сайт защищён reCAPTCHA, применяются{" "}
            <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:no-underline"
            >
                Политика конфиденциальности
            </a>{" "}
            и{" "}
            <a
                href="https://policies.google.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:no-underline"
            >
                Условия использования
            </a>{" "}
            Google.
        </p>
    );
}

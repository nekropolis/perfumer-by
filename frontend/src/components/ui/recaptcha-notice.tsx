"use client";

type Props = {
    className?: string;
};

export default function RecaptchaNotice({ className }: Props) {
    return (
        <p className={className ?? "text-xs text-[var(--text-secondary)]"}>
            This site is protected by reCAPTCHA and the Google{" "}
            <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:no-underline"
            >
                Privacy Policy
            </a>{" "}
            and{" "}
            <a
                href="https://policies.google.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:no-underline"
            >
                Terms of Service
            </a>{" "}
            apply.
        </p>
    );
}

declare global {
    interface Window {
        grecaptcha?: {
            ready: (cb: () => void) => void;
            execute: (siteKey: string, options: { action: string }) => Promise<string>;
        };
    }
}

const SCRIPT_ID = "recaptcha-v3-script-global";

export function loadRecaptchaScript(siteKey: string): Promise<void> {
    if (typeof document === "undefined" || !siteKey) {
        return Promise.resolve();
    }
    if (typeof window !== "undefined" && window.grecaptcha) {
        return Promise.resolve();
    }
    if (document.getElementById(SCRIPT_ID)) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.id = SCRIPT_ID;
        script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Не удалось загрузить reCAPTCHA"));
        document.head.appendChild(script);
    });
}

export async function executeRecaptchaV3(siteKey: string, action: string): Promise<string | undefined> {
    if (!siteKey || typeof window === "undefined" || !window.grecaptcha) {
        return undefined;
    }

    return new Promise((resolve) => {
        window.grecaptcha?.ready(async () => {
            try {
                const token = await window.grecaptcha?.execute(siteKey, { action });
                resolve(token);
            } catch {
                resolve(undefined);
            }
        });
    });
}

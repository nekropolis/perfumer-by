type SmsDevHintProps = {
    value: string;
    /** Например: «Код подтверждения» или «Новый пароль» */
    label: string;
};

export default function SmsDevHint({ value, label }: SmsDevHintProps) {
    if (!value.trim()) {
        return null;
    }

    return (
        <p className="mt-2 text-sm leading-snug text-blue-700">
            Viber/SMS недоступны. {label}: <strong className="font-semibold">{value}</strong>
        </p>
    );
}

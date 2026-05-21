type Props = {
    text?: string;
};

export default function AdminLoadingState({ text = "Загрузка..." }: Props) {
    return (
        <div className="flex items-center gap-3 rounded-lg border border-admin-border bg-admin-muted/60 px-4 py-6">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-admin-primary border-t-transparent" />
            <span className="text-sm text-admin-text-secondary">{text}</span>
        </div>
    );
}

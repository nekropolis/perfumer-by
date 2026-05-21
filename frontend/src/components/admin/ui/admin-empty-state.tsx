type Props = {
    title?: string;
    description?: string;
};

export default function AdminEmptyState({
    title = "Ничего не найдено",
    description = "Попробуйте изменить параметры поиска или создать новую запись.",
}: Props) {
    return (
        <div className="rounded-lg border border-dashed border-admin-border bg-admin-muted/50 px-5 py-8 text-center">
            <div className="text-base font-semibold text-admin-text">{title}</div>
            <div className="mt-2 text-sm leading-6 text-admin-text-secondary">{description}</div>
        </div>
    );
}

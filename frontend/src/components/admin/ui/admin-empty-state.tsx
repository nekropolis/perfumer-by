type Props = {
    title?: string;
    description?: string;
};

export default function AdminEmptyState({
                                            title = "Ничего не найдено",
                                            description = "Попробуйте изменить параметры поиска или создать новую запись.",
                                        }: Props) {
    return (
        <div className="rounded-xl border border-dashed px-4 py-6 text-gray-600">
            <div className="font-medium text-gray-800">{title}</div>
            <div className="mt-1 text-sm">{description}</div>
        </div>
    );
}
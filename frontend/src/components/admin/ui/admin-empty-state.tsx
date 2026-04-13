type Props = {
    title?: string;
    description?: string;
};

export default function AdminEmptyState({
                                            title = "Ничего не найдено",
                                            description = "Попробуйте изменить параметры поиска или создать новую запись.",
                                        }: Props) {
    return (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 px-5 py-8 text-center">
            <div className="text-base font-semibold text-gray-800">{title}</div>
            <div className="mt-2 text-sm leading-6 text-gray-500">{description}</div>
        </div>
    );
}

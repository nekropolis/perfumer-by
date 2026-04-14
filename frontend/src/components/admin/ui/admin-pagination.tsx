"use client";

type Props = {
    currentPage: number;
    lastPage: number;
    onPrevAction: () => void;
    onNextAction: () => void;
};

export default function AdminPagination({
                                            currentPage,
                                            lastPage,
                                            onPrevAction,
                                            onNextAction,
                                        }: Props) {
    if (lastPage <= 1) {
        return null;
    }

    return (
        <div className="flex items-center justify-between">
            <button
                type="button"
                onClick={onPrevAction}
                disabled={currentPage <= 1}
                className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
            >
                Назад
            </button>

            <div className="text-sm text-gray-500">
                Страница {currentPage} из {lastPage}
            </div>

            <button
                type="button"
                onClick={onNextAction}
                disabled={currentPage >= lastPage}
                className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
            >
                Вперёд
            </button>
        </div>
    );
}

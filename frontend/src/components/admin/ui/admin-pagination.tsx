"use client";

import { adminBtnSecondary } from "@/lib/admin-ui-classes";

type Props = {
    currentPage: number;
    lastPage: number;
    onPrevAction: () => void;
    onNextAction: () => void;
};

export default function AdminPagination({ currentPage, lastPage, onPrevAction, onNextAction }: Props) {
    if (lastPage <= 1) {
        return null;
    }

    return (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-admin-border bg-admin-surface px-4 py-2.5">
            <button
                type="button"
                onClick={onPrevAction}
                disabled={currentPage <= 1}
                className={`${adminBtnSecondary} disabled:opacity-50`}
            >
                Назад
            </button>

            <div className="text-sm text-admin-text-secondary">
                Страница <span className="font-medium text-admin-text">{currentPage}</span> из{" "}
                <span className="font-medium text-admin-text">{lastPage}</span>
            </div>

            <button
                type="button"
                onClick={onNextAction}
                disabled={currentPage >= lastPage}
                className={`${adminBtnSecondary} disabled:opacity-50`}
            >
                Вперёд
            </button>
        </div>
    );
}

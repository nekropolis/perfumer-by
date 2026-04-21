import { Info } from "lucide-react";
import type { MouseEvent } from "react";

type Props = {
    count?: number;
    onClickAction?: (event: MouseEvent<HTMLButtonElement>) => void;
};

export default function AdminInfoButton({ count, onClickAction }: Props) {
    return (
        <button
            type="button"
            onClick={onClickAction}
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border text-gray-600 transition hover:bg-gray-50"
            title="Подробности позиции"
            aria-label="Подробности позиции"
        >
            <Info className="h-4 w-4" />
            {(count ?? 0) > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-gray-900 px-1 text-[10px] font-semibold text-white">
                    {count}
                </span>
            )}
        </button>
    );
}

import Link from "next/link";

type Props = {
    currentPage: number;
    lastPage: number;
    basePath: string;
};

export default function CatalogPagination({
                                              currentPage,
                                              lastPage,
                                              basePath,
                                          }: Props) {
    if (lastPage <= 1) {
        return null;
    }

    return (
        <div className="mt-8 flex items-center justify-center gap-2">
            <Link
                href={`${basePath}?page=${Math.max(1, currentPage - 1)}`}
                className={`rounded-lg border px-3 py-2 text-sm ${
                    currentPage <= 1 ? "pointer-events-none opacity-50" : ""
                }`}
            >
                Назад
            </Link>

            {Array.from({ length: lastPage }, (_, index) => index + 1)
                .slice(Math.max(0, currentPage - 3), Math.min(lastPage, currentPage + 2))
                .map((page) => (
                    <Link
                        key={page}
                        href={`${basePath}?page=${page}`}
                        className={`rounded-lg px-3 py-2 text-sm border ${
                            page === currentPage
                                ? "bg-black text-white border-black"
                                : "bg-white text-black"
                        }`}
                    >
                        {page}
                    </Link>
                ))}

            <Link
                href={`${basePath}?page=${Math.min(lastPage, currentPage + 1)}`}
                className={`rounded-lg border px-3 py-2 text-sm ${
                    currentPage >= lastPage ? "pointer-events-none opacity-50" : ""
                }`}
            >
                Вперёд
            </Link>
        </div>
    );
}

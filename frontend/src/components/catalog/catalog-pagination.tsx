import Link from "next/link";

type Props = {
    currentPage: number;
    lastPage: number;
    basePath: string;
    queryString?: string;
};

export default function CatalogPagination({
                                              currentPage,
                                              lastPage,
                                              basePath,
                                              queryString = "",
                                          }: Props) {
    if (lastPage <= 1) {
        return null;
    }

    const buildPageHref = (page: number) => {
        const params = new URLSearchParams(queryString);
        params.set("page", String(page));
        return `${basePath}?${params.toString()}`;
    };

    return (
        <div className="mt-8 flex items-center justify-center gap-2">
            <Link
                href={buildPageHref(Math.max(1, currentPage - 1))}
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
                        href={buildPageHref(page)}
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
                href={buildPageHref(Math.min(lastPage, currentPage + 1))}
                className={`rounded-lg border px-3 py-2 text-sm ${
                    currentPage >= lastPage ? "pointer-events-none opacity-50" : ""
                }`}
            >
                Вперёд
            </Link>
        </div>
    );
}

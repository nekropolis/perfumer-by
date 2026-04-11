import Link from "next/link";

type BreadcrumbItem = {
    label: string;
    href?: string;
};

type Props = {
    items: BreadcrumbItem[];
    className?: string;
};

export default function Breadcrumbs({ items, className = "" }: Props) {
    if (!items.length) {
        return null;
    }

    return (
        <nav className={`text-sm text-gray-500 ${className}`} aria-label="Хлебные крошки">
            <ol className="flex flex-wrap items-center gap-2">
                {items.map((item, index) => {
                    const isLast = index === items.length - 1;

                    return (
                        <li key={`${item.label}-${index}`} className="flex items-center gap-2">
                            {item.href && !isLast ? (
                                <Link href={item.href} className="hover:text-black">
                                    {item.label}
                                </Link>
                            ) : (
                                <span className={isLast ? "text-gray-900" : ""}>{item.label}</span>
                            )}

                            {!isLast && <span>/</span>}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

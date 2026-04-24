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
        <nav className={`text-sm text-[var(--text-secondary)] ${className}`} aria-label="Хлебные крошки">
            <ol className="flex flex-wrap items-center gap-2">
                {items.map((item, index) => {
                    const isLast = index === items.length - 1;

                    return (
                        <li key={`${item.label}-${index}`} className="flex items-center gap-2">
                            {item.href && !isLast ? (
                                <Link href={item.href} className="transition hover:text-[var(--foreground)]">
                                    {item.label}
                                </Link>
                            ) : (
                                <span className={isLast ? "text-[var(--foreground)]" : ""}>{item.label}</span>
                            )}

                            {!isLast && <span>/</span>}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

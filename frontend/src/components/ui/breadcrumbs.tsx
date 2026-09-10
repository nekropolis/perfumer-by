import Link from "next/link";
import { ChevronLeft } from "lucide-react";

type BreadcrumbItem = {
    label: string;
    href?: string;
};

type Props = {
    items: BreadcrumbItem[];
    className?: string;
    alwaysShow?: boolean;
};

export default function Breadcrumbs({ items, className = "", alwaysShow = false }: Props) {
    if (!items.length) {
        return null;
    }

    const parentItem = items.length > 1 ? items[items.length - 2] : null;

    return (
        <nav className={`text-sm ${className}`} aria-label="Хлебные крошки">
            {!alwaysShow && parentItem?.href ? (
                <Link
                    href={parentItem.href}
                    className="mb-3 inline-flex items-center gap-1 text-admin-text-secondary transition hover:text-admin-text md:hidden"
                >
                    <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
                    <span>{parentItem.label}</span>
                </Link>
            ) : null}

            <ol
                className={`${alwaysShow ? "flex" : "hidden md:flex"} flex-wrap items-center gap-2 text-admin-text-secondary`}
            >
                {items.map((item, index) => {
                    const isLast = index === items.length - 1;

                    return (
                        <li key={`${item.label}-${index}`} className="flex items-center gap-2">
                            {item.href && !isLast ? (
                                <Link href={item.href} className="transition hover:text-admin-text">
                                    {item.label}
                                </Link>
                            ) : (
                                <span className={isLast ? "text-admin-text" : ""}>{item.label}</span>
                            )}

                            {!isLast && <span className="text-admin-border-strong">/</span>}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

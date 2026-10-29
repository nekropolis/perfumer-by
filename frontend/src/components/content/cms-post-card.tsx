import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { siteCard } from "@/lib/site-ui-classes";

type Props = {
    href: string;
    title: string;
    excerpt?: string | null;
    coverImage?: string | null;
    dateLabel: string;
};

export default function CmsPostCard({ href, title, excerpt, coverImage, dateLabel }: Props) {
    return (
        <Link
            href={href}
            className={`${siteCard} group flex h-full flex-col overflow-hidden transition duration-300 ease-out hover:border-admin-border-strong hover:shadow-md md:hover:scale-[1.03]`}
        >
            {coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverImage} alt="" className="h-44 w-full shrink-0 object-cover" />
            ) : null}
            <div className="flex flex-1 flex-col gap-2 p-4">
                <h2 className="line-clamp-2 text-base font-semibold text-admin-text">{title}</h2>
                <p className="line-clamp-3 text-sm text-admin-text-secondary">{excerpt || "—"}</p>
                <div className="mt-auto flex items-center justify-between gap-3 pt-2 text-sm">
                    <span className="text-admin-text-secondary">{dateLabel}</span>
                    <span
                        aria-hidden
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-admin-primary transition duration-300 ease-out md:group-hover:scale-125"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </span>
                </div>
            </div>
        </Link>
    );
}

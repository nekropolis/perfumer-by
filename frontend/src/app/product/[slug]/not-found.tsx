import type { Metadata } from "next";
import StoreNotFoundView from "@/components/layout/store-not-found-view";

export const metadata: Metadata = {
    title: "Страница не найдена",
    robots: { index: false, follow: false },
};

export default function ProductSlugNotFound() {
    return <StoreNotFoundView />;
}

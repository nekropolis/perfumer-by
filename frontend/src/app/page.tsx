"use client";

import Link from "next/link";

export default function CartPage() {
    return (
        <main className="max-w-5xl mx-auto px-6 py-10">
            <Link href="/catalog" className="border rounded-xl px-4 py-2 inline-block">
                Перейти в каталог
            </Link>
        </main>
    );
}
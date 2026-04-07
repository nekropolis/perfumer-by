import Link from "next/link";

export default function HomePage() {
  return (
      <main className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-semibold mb-6">Perfumer</h1>

        <div className="flex gap-4">
          <Link href="/catalog" className="border rounded-xl px-4 py-2">
            Каталог
          </Link>
        </div>
      </main>
  );
}
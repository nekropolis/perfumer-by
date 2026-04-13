import Link from "next/link";

export default function Footer() {
    return (
        <footer className="border-t bg-white">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">

                {/* GRID */}
                <div className="grid grid-cols-1 gap-10 md:grid-cols-3 text-center md:text-left">

                    {/* 1. Контакты */}
                    <div className="flex flex-col items-center md:items-start">
                        <div className="mb-4 text-sm font-semibold uppercase text-gray-500">
                            Связаться с нами
                        </div>

                        <div className="space-y-2 text-sm text-gray-700">
                            <a href="tel:+375296408833" className="block hover:underline">
                                +375 (29/33/25) 640-88-33
                            </a>
                            <a href="tel:+375296408833" className="block hover:underline">
                                anystore +375 (29) 640-88-33
                            </a>
                            <a href="tel:+375336408833" className="block hover:underline">
                                anystore +375 (33) 640-88-33
                            </a>
                            <a href="tel:+375256408833" className="block hover:underline">
                                anystore +375 (25) 640-88-33
                            </a>
                        </div>
                    </div>

                    {/* 2. Информация */}
                    <div className="flex flex-col items-center md:items-start">
                        <div className="mb-4 text-sm font-semibold uppercase text-gray-500">
                            Информация
                        </div>

                        <div className="flex flex-col gap-2 text-sm text-gray-700">
                            <Link href="#" className="hover:underline">
                                Дисконтная программа
                            </Link>
                            <Link href="#" className="hover:underline">
                                Подарочные сертификаты
                            </Link>
                            <Link href="#" className="hover:underline">
                                О нас
                            </Link>
                            <Link href="#" className="hover:underline">
                                Информация о доставке
                            </Link>
                            <Link href="#" className="hover:underline">
                                Акции и скидки
                            </Link>
                            <Link href="#" className="hover:underline">
                                Наши партнеры
                            </Link>
                        </div>
                    </div>

                    {/* 3. Дополнительно */}
                    <div className="flex flex-col items-center md:items-start">
                        <div className="mb-4 text-sm font-semibold uppercase text-gray-500">
                            Дополнительно
                        </div>

                        <div className="flex flex-col gap-2 text-sm text-gray-700">
                            <Link href="#" className="hover:underline">
                                Производители
                            </Link>
                            <Link href="#" className="hover:underline">
                                Партнёры
                            </Link>
                            <Link href="#" className="hover:underline">
                                Карта сайта
                            </Link>
                        </div>
                    </div>
                </div>

                {/* BOTTOM */}
                <div className="mt-12 border-t pt-6 text-sm text-gray-500 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
                    <div>© {new Date().getFullYear()} Perfumer</div>
                    <div>Все права защищены</div>
                </div>
            </div>
        </footer>
    );
}
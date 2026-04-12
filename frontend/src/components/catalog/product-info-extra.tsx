"use client";

import { Truck, CreditCard, Phone } from "lucide-react";

export default function ProductInfoExtra() {
    return (
        <div className="rounded-2xl border p-5 text-sm">
            <div className="space-y-5">

                <div>
                    <div className="flex items-center gap-2 font-medium">
                        <Truck size={16} />
                        Доставка г. Минск
                    </div>
                    <ul className="space-y-1 text-gray-600">
                        <li>Белпочтой</li>
                        <li>Европочтой до отделения</li>
                        <li>Курьером по РБ</li>
                    </ul>
                </div>

                <div>
                    <div className="flex items-center gap-2 font-medium">
                        <CreditCard size={16} />
                        Оплата
                    </div>
                    <ul className="space-y-1 text-gray-600">
                        <li>Наличными курьеру</li>
                        <li>Наложенным платежом</li>
                        <li>Банковской картой онлайн</li>
                    </ul>
                </div>

                <div>
                    <div className="flex items-center gap-2 font-medium">
                        <Phone size={16} />
                        Возникли вопросы?
                    </div>

                    <div className="text-gray-600">
                        Звоните:
                    </div>

                    <div className="mt-1 font-medium">
                        Life / Velcom / МТС
                    </div>

                    <div className="text-lg font-semibold tracking-wide">
                        640-88-33
                    </div>

                    <button
                        type="button"
                        className="mt-3 text-sm underline hover:no-underline"
                    >
                        Или мы сами Вам перезвоним
                    </button>
                </div>

            </div>
        </div>
    );
}

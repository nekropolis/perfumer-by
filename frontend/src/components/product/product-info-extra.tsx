"use client";

import { Truck, CreditCard, Phone } from "lucide-react";
import { siteCard } from "@/lib/site-ui-classes";

export default function ProductInfoExtra() {
    return (
        <div className={`${siteCard} p-5 text-sm`}>
            <div className="space-y-5">
                <div>
                    <div className="flex items-center gap-2 font-medium text-admin-text">
                        <Truck size={16} />
                        Доставка г. Минск
                    </div>
                    <ul className="space-y-1 text-admin-text-secondary">
                        <li>Белпочтой</li>
                        <li>Европочтой до отделения</li>
                        <li>Курьером по РБ</li>
                    </ul>
                </div>

                <div>
                    <div className="flex items-center gap-2 font-medium text-admin-text">
                        <CreditCard size={16} />
                        Оплата
                    </div>
                    <ul className="space-y-1 text-admin-text-secondary">
                        <li>Наличными курьеру</li>
                        <li>Наложенным платежом</li>
                        <li>Банковской картой онлайн</li>
                    </ul>
                </div>

                <div>
                    <div className="flex items-center gap-2 font-medium text-admin-text">
                        <Phone size={16} />
                        Возникли вопросы?
                    </div>

                    <div className="text-admin-text-secondary">Звоните:</div>

                    <div className="mt-1 font-medium text-admin-text">МТС / A1 / life</div>

                    <div className="text-lg font-semibold tracking-wide text-admin-text">640-88-33</div>

                    <button
                        type="button"
                        className="mt-3 text-sm text-admin-primary underline hover:no-underline"
                    >
                        Или мы сами Вам перезвоним
                    </button>
                </div>
            </div>
        </div>
    );
}

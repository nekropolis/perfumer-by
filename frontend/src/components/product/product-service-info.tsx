import { CreditCard, Phone, Truck } from "lucide-react";

export default function ProductServiceInfo() {
    return (
        <div className="rounded-3xl bg-gray-50 p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-white p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <Truck size={16} />
                        <div className="text-sm font-medium">Доставка</div>
                    </div>

                    <ul className="space-y-1 text-sm text-gray-600">
                        <li>Белпочтой</li>
                        <li>Европочтой до отделения</li>
                        <li>Курьером по РБ</li>
                    </ul>
                </div>

                <div className="rounded-2xl bg-white p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <CreditCard size={16} />
                        <div className="text-sm font-medium">Оплата</div>
                    </div>

                    <ul className="space-y-1 text-sm text-gray-600">
                        <li>Наличными курьеру</li>
                        <li>Наложенным платежом</li>
                        <li>Банковской картой онлайн</li>
                    </ul>
                </div>

                <div className="rounded-2xl bg-white p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <Phone size={16} />
                        <div className="text-sm font-medium">Нужна помощь?</div>
                    </div>

                    <div className="text-sm text-gray-600">МТС / A1 / life</div>
                    <div className="mt-2 text-2xl font-semibold tracking-tight">640-88-33</div>

                    <button
                        type="button"
                        className="mt-3 text-sm underline underline-offset-4 hover:no-underline"
                    >
                        Мы Вам перезвоним
                    </button>
                </div>
            </div>
        </div>
    );
}
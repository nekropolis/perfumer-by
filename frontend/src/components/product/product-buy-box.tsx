type Variant = {
    id: number;
    display_name: string;
    type: string | null;
    price: string | null;
    old_price: string | null;
    discount_percent: number | null;
    stock: number;
    is_preorder: boolean;
    is_available: boolean;
};

type Props = {
    selectedVariant: Variant | null;
    isPending: boolean;
    onAddToCart: () => void;
    formatPrice: (price: string | null) => string;
};

export default function ProductBuyBox({
                                          selectedVariant,
                                          isPending,
                                          onAddToCart,
                                          formatPrice,
                                      }: Props) {
    return (
        <div className="rounded-3xl border bg-white p-6 shadow-sm">
            {selectedVariant ? (
                <>
                    <div className="mb-2 text-sm text-gray-500">Выбранный вариант</div>

                    <div className="mb-1 text-2xl font-semibold leading-tight">
                        {selectedVariant.display_name}
                    </div>

                    {selectedVariant.type && (
                        <div className="mb-5 text-sm text-gray-500">
                            {selectedVariant.type}
                        </div>
                    )}

                    <div className="mb-4 flex flex-wrap items-end gap-2">
                        <div className="text-4xl font-semibold leading-none">
                            {selectedVariant.price
                                ? formatPrice(selectedVariant.price)
                                : "Предзаказ"}
                        </div>

                        {selectedVariant.old_price && (
                            <div className="text-base text-gray-400 line-through">
                                {formatPrice(selectedVariant.old_price)}
                            </div>
                        )}
                    </div>

                    {selectedVariant.discount_percent && (
                        <div className="mb-4 inline-flex rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
                            -{selectedVariant.discount_percent}%
                        </div>
                    )}

                    <div className="mb-6">
                        {selectedVariant.is_available ? (
                            selectedVariant.is_preorder ? (
                                <div className="text-sm font-medium text-amber-700">
                                    Доступно под заказ
                                </div>
                            ) : (
                                <div className="text-sm font-medium text-green-700">
                                    В наличии: {selectedVariant.stock} шт.
                                </div>
                            )
                        ) : (
                            <div className="text-sm font-medium text-red-700">
                                Нет в наличии
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={onAddToCart}
                        disabled={!selectedVariant.is_available || isPending}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-black to-neutral-800 px-5 py-4 text-base font-medium text-white transition-all duration-150 hover:-translate-y-[1px] hover:shadow-md active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            className="h-5 w-5"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M2.25 3h1.386c.51 0 .955.343 1.087.836L5.61 7.5m0 0h12.84c.75 0 1.398.52 1.56 1.252l1.038 4.5a1.125 1.125 0 01-1.098 1.373H7.125a1.125 1.125 0 01-1.098-.877L5.61 7.5zM8.25 19.5a.75.75 0 100 1.5.75.75 0 000-1.5zm10.5 0a.75.75 0 100 1.5.75.75 0 000-1.5z"
                            />
                        </svg>

                        <span>{isPending ? "Добавление..." : "Добавить в корзину"}</span>
                    </button>
                </>
            ) : (
                <div className="text-sm text-gray-500">Выберите вариант товара</div>
            )}
        </div>
    );
}
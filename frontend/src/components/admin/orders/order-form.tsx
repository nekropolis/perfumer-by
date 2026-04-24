"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderData } from "@/types/orders";
import type { AdminOrderPayload } from "@/lib/admin-orders-api";
import {
  fetchProductById,
  smartSearchProducts,
  type ProductAdminDetail,
  type ProductSmartSearchItem,
} from "@/lib/admin-products-api";
import useDebouncedValue from "@/hooks/use-debounced-value";

type OrderFormItem = {
  product_id: number | null;
  variant_id: number | null;
  product_name: string;
  product_slug: string | null;
  brand_name: string | null;
  variant_title: string;
  sku: string | null;
  qty: number;
  price: number;
};

type Props = {
  mode: "create" | "edit";
  order?: OrderData;
  onSubmitAction: (payload: AdminOrderPayload) => Promise<void>;
};

function toInitialItems(order?: OrderData): OrderFormItem[] {
  if (!order || order.items.length === 0) {
    return [{
      product_id: null,
      variant_id: null,
      product_name: "",
      product_slug: null,
      brand_name: null,
      variant_title: "",
      sku: null,
      qty: 1,
      price: 0,
    }];
  }

  return order.items.map((item) => ({
    product_id: item.product_id ?? null,
    variant_id: item.variant_id ?? null,
    product_name: item.product_name ?? "",
    product_slug: item.product_slug ?? null,
    brand_name: item.brand_name ?? null,
    variant_title: item.variant_title ?? "",
    sku: item.sku ?? null,
    qty: Number(item.qty) || 1,
    price: Number(item.price) || 0,
  }));
}

export default function AdminOrderForm({ mode, order, onSubmitAction }: Props) {
  const router = useRouter();
  const [customerName, setCustomerName] = useState(order?.customer_name ?? "");
  const [phone, setPhone] = useState(order?.phone ?? "");
  const [comment, setComment] = useState(order?.comment ?? "");
  const [deliveryMethod, setDeliveryMethod] = useState(order?.delivery_method ?? "");
  const [deliveryCity, setDeliveryCity] = useState(order?.delivery_city ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState(order?.delivery_address ?? "");
  const [paymentMethod, setPaymentMethod] = useState(order?.payment_method ?? "");
  const [deliveryFee, setDeliveryFee] = useState(Number(order?.delivery_fee ?? 0));
  const [items, setItems] = useState<OrderFormItem[]>(toInitialItems(order));
  const [activeSearchRow, setActiveSearchRow] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<ProductSmartSearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [productDetailsById, setProductDetailsById] = useState<Record<number, ProductAdminDetail>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const activeSearchQuery = activeSearchRow !== null ? items[activeSearchRow]?.product_name ?? "" : "";
  const debouncedActiveSearchQuery = useDebouncedValue(activeSearchQuery, 250);

  useEffect(() => {
    if (activeSearchRow === null || debouncedActiveSearchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setSearchLoading(true);
      try {
        const response = await smartSearchProducts({ q: debouncedActiveSearchQuery.trim(), limit: 8 });
        if (!cancelled) {
          setSearchResults(response.data ?? []);
        }
      } catch {
        if (!cancelled) {
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeSearchRow, debouncedActiveSearchQuery]);

  useEffect(() => {
    const missingProductIds = Array.from(
      new Set(
        items
          .map((item) => item.product_id)
          .filter((id): id is number => typeof id === "number" && !productDetailsById[id]),
      ),
    );

    if (missingProductIds.length === 0) {
      return;
    }

    void (async () => {
      const loaded: Record<number, ProductAdminDetail> = {};
      for (const productId of missingProductIds) {
        try {
          const response = await fetchProductById(productId);
          loaded[productId] = response.data;
        } catch {
          // no-op: оставляем ручной ввод варианта, если товар не удалось подтянуть
        }
      }
      if (Object.keys(loaded).length > 0) {
        setProductDetailsById((prev) => ({ ...prev, ...loaded }));
      }
    })();
  }, [items, productDetailsById]);

  const subtotal = useMemo(
    () => items.reduce((acc, item) => acc + Math.max(0, item.qty) * Math.max(0, item.price), 0),
    [items],
  );
  const total = subtotal + Math.max(0, deliveryFee || 0);

  const setItemField = <K extends keyof OrderFormItem>(idx: number, key: K, value: OrderFormItem[K]) => {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [key]: value } : item)));
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        product_id: null,
        variant_id: null,
        product_name: "",
        product_slug: null,
        brand_name: null,
        variant_title: "",
        sku: null,
        qty: 1,
        price: 0,
      },
    ]);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const selectProduct = async (rowIdx: number, product: ProductSmartSearchItem) => {
    setSearchResults([]);
    setActiveSearchRow(null);

    let detail = productDetailsById[product.id];
    if (!detail) {
      const response = await fetchProductById(product.id);
      detail = response.data;
      setProductDetailsById((prev) => ({ ...prev, [product.id]: detail }));
    }

    const preferredVariant = detail.variants?.[0];
    setItems((prev) =>
      prev.map((row, idx) => {
        if (idx !== rowIdx) {
          return row;
        }

        return {
          ...row,
          product_id: detail.id,
          product_name: detail.name,
          product_slug: detail.slug,
          brand_name: detail.brand?.name ?? null,
          variant_id: preferredVariant?.id ?? null,
          variant_title: preferredVariant?.title ?? "",
          sku: preferredVariant?.display_name ?? row.sku ?? null,
          price: Number(preferredVariant?.price ?? row.price ?? 0),
        };
      }),
    );
  };

  const handleVariantChange = async (rowIdx: number, variantId: number) => {
    const row = items[rowIdx];
    if (!row?.product_id) {
      return;
    }

    let detail = productDetailsById[row.product_id];
    if (!detail) {
      const response = await fetchProductById(row.product_id);
      detail = response.data;
      setProductDetailsById((prev) => ({ ...prev, [row.product_id!]: detail }));
    }

    const selectedVariant = detail.variants?.find((variant) => variant.id === variantId);
    if (!selectedVariant) {
      return;
    }

    setItems((prev) =>
      prev.map((candidate, idx) =>
        idx === rowIdx
          ? {
            ...candidate,
            variant_id: selectedVariant.id,
            variant_title: selectedVariant.title ?? candidate.variant_title,
            sku: selectedVariant.display_name ?? candidate.sku ?? null,
            price: Number(selectedVariant.price ?? candidate.price),
          }
          : candidate,
      ),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!phone.trim()) {
      setError("Укажите телефон");
      return;
    }

    if (items.length === 0) {
      setError("Добавьте хотя бы один товар");
      return;
    }

    if (items.some((item) => !item.product_name.trim() || !item.variant_title.trim() || item.qty < 1)) {
      setError("Проверьте заполнение товаров: название, вариант и количество обязательны");
      return;
    }

    setSaving(true);
    try {
      await onSubmitAction({
        customer_name: customerName.trim() || null,
        phone: phone.trim(),
        comment: comment.trim() || null,
        delivery_method: deliveryMethod.trim() || null,
        delivery_city: deliveryCity.trim() || null,
        delivery_address: deliveryAddress.trim() || null,
        payment_method: paymentMethod.trim() || null,
        delivery_fee: Math.max(0, Number(deliveryFee) || 0),
        items: items.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          product_name: item.product_name.trim(),
          product_slug: item.product_slug,
          brand_name: item.brand_name,
          variant_title: item.variant_title.trim(),
          sku: item.sku,
          qty: Math.max(1, Number(item.qty) || 1),
          price: Math.max(0, Number(item.price) || 0),
        })),
      });

      router.push("/admin/orders");
      router.refresh();
    } catch (eUnknown) {
      setError(eUnknown instanceof Error ? eUnknown.message : "Не удалось сохранить заказ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border bg-white p-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="text-sm">
          <div className="mb-1 text-gray-600">Имя клиента</div>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="w-full rounded-xl border px-3 py-2"
          />
        </label>

        <label className="text-sm">
          <div className="mb-1 text-gray-600">Телефон *</div>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border px-3 py-2"
            required
          />
        </label>

        <label className="text-sm">
          <div className="mb-1 text-gray-600">Способ доставки</div>
          <input
            value={deliveryMethod}
            onChange={(e) => setDeliveryMethod(e.target.value)}
            className="w-full rounded-xl border px-3 py-2"
          />
        </label>

        <label className="text-sm">
          <div className="mb-1 text-gray-600">Город</div>
          <input
            value={deliveryCity}
            onChange={(e) => setDeliveryCity(e.target.value)}
            className="w-full rounded-xl border px-3 py-2"
          />
        </label>

        <label className="text-sm md:col-span-2">
          <div className="mb-1 text-gray-600">Адрес доставки</div>
          <input
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
            className="w-full rounded-xl border px-3 py-2"
          />
        </label>

        <label className="text-sm">
          <div className="mb-1 text-gray-600">Способ оплаты</div>
          <input
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full rounded-xl border px-3 py-2"
          />
        </label>

        <label className="text-sm">
          <div className="mb-1 text-gray-600">Доставка (руб.)</div>
          <input
            type="number"
            min={0}
            step="0.01"
            value={deliveryFee}
            onChange={(e) => setDeliveryFee(Number(e.target.value))}
            className="w-full rounded-xl border px-3 py-2"
          />
        </label>

        <label className="text-sm md:col-span-2">
          <div className="mb-1 text-gray-600">Комментарий</div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="w-full rounded-xl border px-3 py-2"
          />
        </label>
      </div>

      <div className="space-y-3 rounded-2xl border p-4">
        <div className="text-sm font-medium">Товары заказа *</div>
        {items.map((item, idx) => (
          <div key={`item-${idx}`} className="grid grid-cols-1 gap-2 md:grid-cols-[1.7fr_1.3fr_110px_120px_auto]">
            <div className="relative">
              <input
                value={item.product_name}
                onFocus={() => setActiveSearchRow(idx)}
                onChange={(e) => {
                  setItemField(idx, "product_name", e.target.value);
                  setItemField(idx, "product_id", null);
                  setItemField(idx, "product_slug", null);
                  setItemField(idx, "brand_name", null);
                  setItemField(idx, "variant_id", null);
                  if (activeSearchRow !== idx) {
                    setActiveSearchRow(idx);
                  }
                }}
                placeholder="Поиск товара"
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
              {activeSearchRow === idx && (searchLoading || searchResults.length > 0) ? (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border bg-white p-1 shadow-lg">
                  {searchLoading ? (
                    <div className="px-2 py-2 text-xs text-gray-500">Поиск...</div>
                  ) : (
                    searchResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => void selectProduct(idx, result)}
                        className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        <div className="font-medium">{result.name}</div>
                        <div className="text-xs text-gray-500">
                          {result.brand_name ? `${result.brand_name} · ` : ""}
                          {result.variant_titles?.slice(0, 2).join(", ") || "Без вариантов"}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
            <div>
              {item.product_id && productDetailsById[item.product_id]?.variants?.length ? (
                <select
                  value={item.variant_id ?? ""}
                  onChange={(e) => void handleVariantChange(idx, Number(e.target.value))}
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                >
                  {productDetailsById[item.product_id].variants!.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.title} {variant.price ? `· ${variant.price} BYN` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={item.variant_title}
                  onChange={(e) => setItemField(idx, "variant_title", e.target.value)}
                  placeholder="Вариант"
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                />
              )}
            </div>
            <input
              type="number"
              min={1}
              value={item.qty}
              onChange={(e) => setItemField(idx, "qty", Number(e.target.value))}
              placeholder="Кол-во"
              className="rounded-xl border px-3 py-2 text-sm"
            />
            <input
              type="number"
              min={0}
              step="0.01"
              value={item.price}
              onChange={(e) => setItemField(idx, "price", Number(e.target.value))}
              placeholder="Цена"
              className="rounded-xl border px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => removeItem(idx)}
              disabled={items.length === 1}
              className="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-600 disabled:opacity-50"
            >
              Удалить
            </button>
          </div>
        ))}
        <button type="button" onClick={addItem} className="rounded-xl border px-3 py-2 text-sm">
          Добавить товар
        </button>
      </div>

      <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
        <div>Сумма товаров: {subtotal.toFixed(2)} руб.</div>
        <div>Итого: {total.toFixed(2)} руб.</div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-60">
          {saving ? "Сохранение..." : mode === "create" ? "Создать заказ" : "Сохранить изменения"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/orders")}
          className="rounded-xl border px-4 py-2 text-sm"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}

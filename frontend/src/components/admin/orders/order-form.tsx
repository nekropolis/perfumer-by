"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { OrderData } from "@/types/orders";
import type { AdminOrderPayload } from "@/lib/admin-orders-api";
import {
  fetchProductById,
  flattenProductSmartSearchHits,
  productSmartSearchAvailabilityClass,
  productSmartSearchAvailabilityLabel,
  productSmartSearchPriceLabel,
  productSmartSearchShowsPrice,
  smartSearchProducts,
  type ProductAdminDetail,
  type ProductSmartSearchItem,
  type ProductSmartSearchVariantPreview,
} from "@/lib/admin-products-api";
import useDebouncedValue from "@/hooks/use-debounced-value";
import { giftCertificateStatusLabel } from "@/lib/admin-loyalty-api";

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
  onSubmitAction: (payload: AdminOrderPayload) => Promise<unknown>;
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
  const productSearchRef = useRef<HTMLDivElement>(null);
  const [productDetailsById, setProductDetailsById] = useState<Record<number, ProductAdminDetail>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const itemsLocked =
    mode === "edit" && order && (order.status === "done" || order.status === "cancelled");
  const activeSearchQuery = activeSearchRow !== null ? items[activeSearchRow]?.product_name ?? "" : "";

  useEffect(() => {
    if (itemsLocked) {
      setActiveSearchRow(null);
      setSearchResults([]);
    }
  }, [itemsLocked]);

  const closeProductSearch = useCallback(() => {
    setActiveSearchRow(null);
    setSearchResults([]);
  }, []);

  useEffect(() => {
    if (activeSearchRow === null) return;
    const onMouseDown = (e: MouseEvent) => {
      if (productSearchRef.current?.contains(e.target as Node)) return;
      closeProductSearch();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [activeSearchRow, closeProductSearch]);

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
    if (itemsLocked) {
      return;
    }
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
    if (itemsLocked) {
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const selectProductVariant = async (
    rowIdx: number,
    product: ProductSmartSearchItem,
    variantPreview: ProductSmartSearchVariantPreview,
  ) => {
    if (itemsLocked) {
      return;
    }
    setSearchResults([]);
    setActiveSearchRow(null);

    let detail = productDetailsById[product.id];
    if (!detail) {
      const response = await fetchProductById(product.id);
      detail = response.data;
      setProductDetailsById((prev) => ({ ...prev, [product.id]: detail }));
    }

    const variantId = variantPreview.id;
    const selectedVariant =
      (variantId != null ? detail.variants?.find((v) => v.id === variantId) : undefined) ??
      detail.variants?.find(
        (v) => (v.title || v.display_name || "").trim() === variantPreview.title.trim(),
      );
    if (!selectedVariant) {
      return;
    }

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
          brand_name: detail.brand?.name ?? product.brand_name ?? null,
          variant_id: selectedVariant.id,
          variant_title: selectedVariant.title ?? variantPreview.title,
          sku: selectedVariant.display_name ?? row.sku ?? null,
          price: Number(selectedVariant.price ?? variantPreview.price ?? row.price ?? 0),
        };
      }),
    );
  };

  const handleVariantChange = async (rowIdx: number, variantId: number) => {
    if (itemsLocked) {
      return;
    }
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
          <div className="mb-1 text-admin-text-secondary">Имя клиента</div>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
          />
        </label>

        <label className="text-sm">
          <div className="mb-1 text-admin-text-secondary">Телефон *</div>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            required
          />
        </label>

        <label className="text-sm">
          <div className="mb-1 text-admin-text-secondary">Способ доставки</div>
          <input
            value={deliveryMethod}
            onChange={(e) => setDeliveryMethod(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
          />
        </label>

        <label className="text-sm">
          <div className="mb-1 text-admin-text-secondary">Город</div>
          <input
            value={deliveryCity}
            onChange={(e) => setDeliveryCity(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
          />
        </label>

        <label className="text-sm md:col-span-2">
          <div className="mb-1 text-admin-text-secondary">Адрес доставки</div>
          <input
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
          />
        </label>

        <label className="text-sm">
          <div className="mb-1 text-admin-text-secondary">Способ оплаты</div>
          <input
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
          />
        </label>

        <label className="text-sm">
          <div className="mb-1 text-admin-text-secondary">Доставка (руб.)</div>
          <input
            type="number"
            min={0}
            step="0.01"
            value={deliveryFee}
            onChange={(e) => setDeliveryFee(Number(e.target.value))}
            className="w-full rounded-lg border px-3 py-2"
          />
        </label>

        <label className="text-sm md:col-span-2">
          <div className="mb-1 text-admin-text-secondary">Комментарий</div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="w-full rounded-lg border px-3 py-2"
          />
        </label>
      </div>

      <div className="space-y-3 rounded-2xl border p-4">
        <div className="text-sm font-medium">Товары заказа *</div>
        {itemsLocked ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Заказ в статусе «Выполнен» или «Отменён» — строки заказа нельзя менять. Можно править только контактные данные,
            доставку и комментарий.
          </p>
        ) : null}
        {items.map((item, idx) => (
          <div key={`item-${idx}`} className="grid grid-cols-1 gap-2 md:grid-cols-[1.7fr_1.3fr_110px_120px_auto]">
            <div className="relative" ref={activeSearchRow === idx ? productSearchRef : undefined}>
              <input
                value={item.product_name}
                onFocus={() => {
                  if (!itemsLocked) {
                    setActiveSearchRow(idx);
                  }
                }}
                onChange={(e) => {
                  if (itemsLocked) {
                    return;
                  }
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
                readOnly={itemsLocked}
                className={`w-full rounded-lg border px-3 py-2 text-sm ${itemsLocked ? "cursor-not-allowed bg-admin-muted text-admin-text" : ""}`}
              />
              {activeSearchRow === idx && (searchLoading || searchResults.length > 0) ? (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border bg-white p-1 shadow-lg">
                  {searchLoading ? (
                    <div className="px-2 py-2 text-xs text-admin-text-secondary">Поиск...</div>
                  ) : (
                    flattenProductSmartSearchHits(searchResults).map((option) => {
                      const hit = option.hit;
                      if (option.kind === "no-variants") {
                        return (
                          <div
                            key={option.key}
                            className="rounded-lg px-2 py-2 text-left text-xs text-admin-text-secondary"
                          >
                            {hit.id} {hit.brand_name ? `${hit.brand_name} ` : ""}
                            {hit.name} — нет вариантов
                          </div>
                        );
                      }
                      const variant = option.variant;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => void selectProductVariant(idx, hit, variant)}
                          className="block w-full rounded-lg px-2 py-2 text-left text-xs hover:bg-admin-muted"
                        >
                          <span className="tabular-nums text-gray-400">{hit.id}</span>{" "}
                          {hit.brand_name ? (
                            <span className="text-admin-text-secondary">{hit.brand_name} </span>
                          ) : null}
                          <span className="font-medium text-admin-text">{hit.name}</span>{" "}
                          <span className="text-admin-text">{variant.title}</span>
                          <span className="text-admin-text-secondary"> — </span>
                          <span className={productSmartSearchAvailabilityClass(variant)}>
                            {productSmartSearchAvailabilityLabel(variant)}
                          </span>
                          {productSmartSearchShowsPrice(variant) ? (
                            <>
                              <span className="text-admin-text-secondary"> — </span>
                              <span className="tabular-nums">{productSmartSearchPriceLabel(variant)}</span>
                            </>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>
            <div>
              {item.product_id && productDetailsById[item.product_id]?.variants?.length ? (
                <select
                  value={item.variant_id ?? ""}
                  disabled={itemsLocked}
                  onChange={(e) => void handleVariantChange(idx, Number(e.target.value))}
                  className="w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-admin-muted disabled:text-admin-text"
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
                  readOnly={itemsLocked}
                  onChange={(e) => setItemField(idx, "variant_title", e.target.value)}
                  placeholder="Вариант"
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${itemsLocked ? "cursor-not-allowed bg-admin-muted text-admin-text" : ""}`}
                />
              )}
            </div>
            <input
              type="number"
              min={1}
              value={item.qty}
              readOnly={itemsLocked}
              onChange={(e) => setItemField(idx, "qty", Number(e.target.value))}
              placeholder="Кол-во"
              className={`rounded-lg border px-3 py-2 text-sm ${itemsLocked ? "cursor-not-allowed bg-admin-muted text-admin-text" : ""}`}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              value={item.price}
              readOnly={itemsLocked}
              onChange={(e) => setItemField(idx, "price", Number(e.target.value))}
              placeholder="Цена"
              className={`rounded-lg border px-3 py-2 text-sm ${itemsLocked ? "cursor-not-allowed bg-admin-muted text-admin-text" : ""}`}
            />
            <button
              type="button"
              onClick={() => removeItem(idx)}
              disabled={itemsLocked || items.length === 1}
              className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 disabled:opacity-50"
            >
              Удалить
            </button>
          </div>
        ))}
        <button type="button" onClick={addItem} disabled={itemsLocked} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">
          Добавить товар
        </button>
      </div>

      {mode === "edit" && order?.gift_certificate_purchases && order.gift_certificate_purchases.length > 0 ? (
        <div className="space-y-2 rounded-2xl border border-violet-100 bg-violet-50/40 p-4">
          <div className="text-sm font-medium text-violet-950">Купленные подарочные сертификаты</div>
          <ul className="space-y-2 text-sm">
            {order.gift_certificate_purchases.map((row) => (
              <li key={row.id} className="rounded-lg border border-violet-100 bg-white px-3 py-2">
                <div className="font-medium text-admin-text">{row.template_title}</div>
                <div className="mt-0.5 text-xs text-admin-text-secondary">
                  Номинал {row.amount} руб. × {row.qty} шт. — всего {row.total} руб.
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-admin-text-secondary">
            Строки из оформления заказа; редактирование через список товаров выше недоступно. Запись в каталоге
            сертификатов создаётся сразу при оформлении (пустой код). После «Выполнен» статус меняется на «Активен»;
            код вносит менеджер в карточке сертификата.
          </p>
        </div>
      ) : null}

      {mode === "edit" && order?.sold_gift_certificates && order.sold_gift_certificates.length > 0 ? (
        <div className="space-y-2 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
          <div className="text-sm font-medium text-emerald-950">Выпущенные сертификаты по заказу</div>
          <ul className="space-y-2 text-sm">
            {order.sold_gift_certificates.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-white px-3 py-2"
              >
                <div>
                  <div className="font-mono text-xs text-admin-text-secondary">ID {row.id}</div>
                  <div className="font-medium text-admin-text">{row.template_title ?? "Сертификат"}</div>
                  <div className="text-xs text-admin-text-secondary">
                    {row.initial_amount} руб. · {giftCertificateStatusLabel(row.status, row.code)}
                    {row.code ? ` · ${row.code}` : ""}
                  </div>
                </div>
                <Link
                  href={`/admin/loyalty/certificates/${row.id}/edit`}
                  className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-900 transition hover:bg-emerald-100"
                >
                  Код и статус
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl bg-admin-muted px-4 py-3 text-sm text-admin-text">
        <div>Сумма товаров: {subtotal.toFixed(2)} руб.</div>
        <div>Итого: {total.toFixed(2)} руб.</div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded-lg bg-admin-primary px-4 py-2 text-sm text-white disabled:opacity-60">
          {saving ? "Сохранение..." : mode === "create" ? "Создать заказ" : "Сохранить изменения"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/orders")}
          className="rounded-lg border px-4 py-2 text-sm"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}

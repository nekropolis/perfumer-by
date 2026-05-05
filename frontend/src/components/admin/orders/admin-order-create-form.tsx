"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createOrder,
  fetchAdminOrderCustomerContext,
  updateOrder,
  type AdminOrderCustomerContext,
  type AdminOrderPayload,
} from "@/lib/admin-orders-api";
import { giftCertificateStatusLabel } from "@/lib/admin-loyalty-api";
import type { OrderData } from "@/types/orders";
import {
  fetchProductById,
  smartSearchProductsWithFallback,
  type ProductAdminDetail,
  type ProductSmartSearchItem,
} from "@/lib/admin-products-api";
import { fetchAdminUsers, type AdminUser } from "@/lib/admin-users-api";
import useDebouncedValue from "@/hooks/use-debounced-value";
import { searchCheckoutCities, type CheckoutCityHit } from "@/lib/checkout-api";

const DELIVERY_OPTIONS = [
  { value: "minsk_courier", label: "Курьер по Минску" },
  { value: "belarus_courier", label: "Курьер по РБ" },
  { value: "pickup", label: "Самовывоз" },
] as const;

const PAYMENT_OPTIONS = [
  { value: "cash", label: "Наличными" },
  { value: "card", label: "Картой (Visa и MasterCard)" },
] as const;

type DeliveryValue = (typeof DELIVERY_OPTIONS)[number]["value"];
type PaymentValue = (typeof PAYMENT_OPTIONS)[number]["value"];

type OrderLine = {
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

function digitsOnly(s: string): string {
  return s.replace(/\D+/g, "");
}

const PHONE_PREFIX = "375";
/** Код оператора (2) + 3 цифры номера — только тогда запрашиваем и показываем клиентов. */
const PHONE_CLIENT_HINT_MIN_NATIONAL = 5;

/** Только 9 цифр после +375 (код оператора + номер). */
function clampNationalDigits(s: string): string {
  return digitsOnly(s).slice(0, 9);
}

function fullPhoneFromNational(national: string): string {
  return PHONE_PREFIX + clampNationalDigits(national);
}

function formatNationalDisplay(national: string): string {
  const d = clampNationalDigits(national);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)} ${d.slice(2)}`;
  if (d.length <= 7) return `${d.slice(0, 2)} ${d.slice(2, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 2)} ${d.slice(2, 5)}-${d.slice(5, 7)}-${d.slice(7, 9)}`;
}

function isValidBelarusMobileNational(national: string): boolean {
  const d = clampNationalDigits(national);
  if (d.length !== 9) return false;
  return ["25", "29", "33", "44"].includes(d.slice(0, 2));
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString("ru-RU");
}

function totalOrdersCount(context: AdminOrderCustomerContext | null): number {
  if (!context) return 0;
  return (
    Number(context.orders.completed || 0) +
    Number(context.orders.cancelled || 0) +
    Number(context.orders.active || 0)
  );
}

function emptyLine(): OrderLine {
  return {
    product_id: null,
    variant_id: null,
    product_name: "",
    product_slug: null,
    brand_name: null,
    variant_title: "",
    sku: null,
    qty: 1,
    price: 0,
  };
}

function nationalFromStoredPhone(phone: string): string {
  const d = digitsOnly(phone);
  if (d.startsWith(PHONE_PREFIX)) return d.slice(PHONE_PREFIX.length).slice(0, 9);
  if (d.length >= 9) return d.slice(-9);
  return d.slice(0, 9);
}

function linesFromOrderItems(order: OrderData): OrderLine[] {
  if (!order.items?.length) return [emptyLine()];
  return order.items.map((item) => ({
    product_id: item.product_id ?? null,
    variant_id: item.variant_id ?? null,
    product_name: item.product_name ?? "",
    product_slug: item.product_slug ?? null,
    brand_name: item.brand_name ?? null,
    variant_title: item.variant_title ?? "",
    sku: item.sku ?? null,
    qty: Math.max(1, Number(item.qty) || 1),
    price: Number(item.price) || 0,
  }));
}

const DELIVERY_VALUE_SET = new Set<string>(DELIVERY_OPTIONS.map((o) => o.value));
function normalizeDelivery(v: string | null | undefined): DeliveryValue {
  const s = (v ?? "").trim();
  if (DELIVERY_VALUE_SET.has(s)) return s as DeliveryValue;
  return "minsk_courier";
}

const PAYMENT_VALUE_SET = new Set<string>(PAYMENT_OPTIONS.map((o) => o.value));
function normalizePayment(v: string | null | undefined): PaymentValue {
  const s = (v ?? "").trim();
  if (PAYMENT_VALUE_SET.has(s)) return s as PaymentValue;
  return "cash";
}

function variantsInStock(detail: ProductAdminDetail | undefined) {
  const variants = detail?.variants ?? [];
  return variants.filter((variant) => variant.is_available || variant.is_preorder);
}

/** Подсветка вхождения запроса (без regex по юникоду). */
function highlightQueryInText(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lowerText = text.toLocaleLowerCase("ru-RU");
  const lowerQ = q.toLocaleLowerCase("ru-RU");
  const parts: ReactNode[] = [];
  let pos = 0;
  for (let n = 0; n < 80 && pos < text.length; n += 1) {
    const idx = lowerText.indexOf(lowerQ, pos);
    if (idx === -1) {
      parts.push(text.slice(pos));
      break;
    }
    if (idx > pos) parts.push(text.slice(pos, idx));
    const matched = text.slice(idx, idx + q.length);
    parts.push(
      <mark key={`h-${idx}-${n}`} className="rounded-sm bg-amber-200 px-0.5 text-gray-900">
        {matched}
      </mark>,
    );
    pos = idx + q.length;
  }
  if (parts.length === 0) return text;
  return <>{parts}</>;
}

export type AdminOrderCreateFormProps = {
  mode?: "create" | "edit";
  initialOrder?: OrderData;
  initialPhone?: string;
};

type CertificatesPanelProps<T> = {
  title: string;
  wrapperClassName: string;
  items: readonly T[];
  renderItem: (item: T) => ReactNode;
  footer?: ReactNode;
};

type SectionCardProps = {
  children: ReactNode;
};

function SectionCard({ children }: SectionCardProps) {
  return <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">{children}</section>;
}

function CertificatesPanel<T>({
  title,
  wrapperClassName,
  items,
  renderItem,
  footer,
}: CertificatesPanelProps<T>) {
  if (items.length === 0) return null;
  return (
    <div className={wrapperClassName}>
      <div className="text-sm font-medium">{title}</div>
      <ul className="space-y-2 text-sm">{items.map((item) => renderItem(item))}</ul>
      {footer ? <p className="text-xs text-gray-600">{footer}</p> : null}
    </div>
  );
}

export default function AdminOrderCreateForm({ mode = "create", initialOrder, initialPhone }: AdminOrderCreateFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit" && initialOrder != null;
  const itemsLocked = Boolean(
    isEdit && initialOrder && (initialOrder.status === "done" || initialOrder.status === "cancelled"),
  );

  /** Только цифры после +375 (9 шт.: 25/29/33/44 + номер). */
  const [nationalNumber, setNationalNumber] = useState(() =>
    initialOrder?.phone ? nationalFromStoredPhone(initialOrder.phone) : nationalFromStoredPhone(initialPhone ?? ""),
  );
  const [customerName, setCustomerName] = useState(() => initialOrder?.customer_name ?? "");
  const [comment, setComment] = useState(() => initialOrder?.comment ?? "");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryValue>(() => normalizeDelivery(initialOrder?.delivery_method));
  const [deliveryCity, setDeliveryCity] = useState(() => initialOrder?.delivery_city ?? "");
  const [citySelect, setCitySelect] = useState<string>("");
  const [deliveryAddress, setDeliveryAddress] = useState(() => initialOrder?.delivery_address ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentValue>(() => normalizePayment(initialOrder?.payment_method));
  const [deliveryFee, setDeliveryFee] = useState(() => Math.max(0, Number(initialOrder?.delivery_fee ?? 0) || 0));
  const [lines, setLines] = useState<OrderLine[]>(() => (initialOrder ? linesFromOrderItems(initialOrder) : [emptyLine()]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [phoneHits, setPhoneHits] = useState<AdminUser[]>([]);
  const [phoneHitsOpen, setPhoneHitsOpen] = useState(false);
  const [phoneHitsLoading, setPhoneHitsLoading] = useState(false);

  const [context, setContext] = useState<AdminOrderCustomerContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [completedOrdersOpen, setCompletedOrdersOpen] = useState(false);

  const debouncedNational = useDebouncedValue(nationalNumber, 280);

  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const debouncedProductQ = useDebouncedValue(productQuery, 250);
  const [productHits, setProductHits] = useState<ProductSmartSearchItem[]>([]);
  const [productHitsLoading, setProductHitsLoading] = useState(false);
  /** Пока грузим карточку после клика по товару — не показываем «Ничего не найдено» по старому запросу. */
  const [loadingProductLineIdx, setLoadingProductLineIdx] = useState<number | null>(null);
  /** Тултип варианта в portal: иначе обрезается shell с overflow-y-auto. */
  const [variantTooltip, setVariantTooltip] = useState<{
    x: number;
    y: number;
    product: string;
    line2: string;
  } | null>(null);
  const [detailsByProductId, setDetailsByProductId] = useState<Record<number, ProductAdminDetail>>({});
  const [pickerProductId, setPickerProductId] = useState<number | null>(null);

  const [belarusCityQuery, setBelarusCityQuery] = useState("");
  const debouncedBelarusCityQuery = useDebouncedValue(belarusCityQuery, 350);
  const [belarusCityHits, setBelarusCityHits] = useState<CheckoutCityHit[]>([]);
  const [belarusCityOpen, setBelarusCityOpen] = useState(false);
  const [belarusManualCity, setBelarusManualCity] = useState(false);
  const [belarusCityLookupFailed, setBelarusCityLookupFailed] = useState(false);

  useEffect(() => {
    if (!variantTooltip) return;
    const hide = () => setVariantTooltip(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [variantTooltip]);

  useEffect(() => {
    if (!itemsLocked) return;
    setActiveLine(null);
    setProductHits([]);
    setPickerProductId(null);
    setProductQuery("");
  }, [itemsLocked]);

  useEffect(() => {
    if (!initialOrder?.items?.length) return;
    const productIds = [
      ...new Set(
        initialOrder.items
          .map((i) => i.product_id)
          .filter((id): id is number => typeof id === "number" && id > 0),
      ),
    ];
    if (productIds.length === 0) return;
    let cancelled = false;
    void (async () => {
      const loaded: Record<number, ProductAdminDetail> = {};
      for (const pid of productIds) {
        try {
          const r = await fetchProductById(pid);
          loaded[pid] = r.data;
        } catch {
          // ignore
        }
      }
      if (!cancelled && Object.keys(loaded).length > 0) {
        setDetailsByProductId((prev) => ({ ...prev, ...loaded }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialOrder?.id, initialOrder?.items]);

  const handleDeliveryMethodChange = useCallback((value: DeliveryValue) => {
    setDeliveryMethod(value);
    if (value === "belarus_courier") {
      setPaymentMethod((pm) => (pm === "card" ? "cash" : pm));
    }
    if (value === "pickup") {
      setDeliveryAddress("");
      setDeliveryCity("");
      setCitySelect("");
    }
  }, []);

  useEffect(() => {
    const nat = clampNationalDigits(debouncedNational);
    if (nat.length < PHONE_CLIENT_HINT_MIN_NATIONAL) {
      setPhoneHits([]);
      return;
    }
    const full = fullPhoneFromNational(nat);
    let cancelled = false;
    setPhoneHitsLoading(true);
    void fetchAdminUsers(full)
      .then((response) => {
        if (!cancelled) {
          const want = digitsOnly(full);
          const rows = (response.data ?? []).filter((user) => {
            if (!user.phone) return false;
            const userPhoneDigits = digitsOnly(user.phone);
            return userPhoneDigits === want || userPhoneDigits.endsWith(nat);
          });
          setPhoneHits(rows.slice(0, 8));
        }
      })
      .catch(() => {
        if (!cancelled) setPhoneHits([]);
      })
      .finally(() => {
        if (!cancelled) setPhoneHitsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedNational]);

  useEffect(() => {
    const fullDigits = digitsOnly(fullPhoneFromNational(debouncedNational));
    if (fullDigits.length < 10) {
      setContext(null);
      return;
    }
    let cancelled = false;
    setContextLoading(true);
    void fetchAdminOrderCustomerContext(fullDigits)
      .then((response) => {
        if (!cancelled) setContext(response.data);
      })
      .catch(() => {
        if (!cancelled) setContext(null);
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedNational]);

  useEffect(() => {
    if (context?.matched_user?.name && !customerName.trim()) {
      setCustomerName(context.matched_user.name);
    }
  }, [context?.matched_user?.name, customerName]);

  useEffect(() => {
    if (!context?.delivery_cities?.length) {
      setCitySelect("");
      return;
    }
    if (citySelect && !context.delivery_cities.includes(citySelect) && citySelect !== "__new__") {
      setCitySelect("");
    }
  }, [context?.delivery_cities, citySelect]);

  useEffect(() => {
    if (deliveryMethod !== "belarus_courier") {
      queueMicrotask(() => {
        setBelarusCityQuery("");
        setBelarusCityHits([]);
        setBelarusCityOpen(false);
        setBelarusManualCity(false);
        setBelarusCityLookupFailed(false);
      });
    }
  }, [deliveryMethod]);

  useEffect(() => {
    if (deliveryMethod !== "belarus_courier") return;
    if (belarusManualCity) {
      queueMicrotask(() => {
        setBelarusCityHits([]);
        setBelarusCityLookupFailed(false);
      });
      return;
    }
    if (deliveryCity.trim()) {
      queueMicrotask(() => {
        setBelarusCityHits([]);
        setBelarusCityLookupFailed(false);
      });
      return;
    }
    if (debouncedBelarusCityQuery.trim().length < 2) {
      queueMicrotask(() => {
        setBelarusCityHits([]);
        setBelarusCityLookupFailed(false);
      });
      return;
    }
    let cancelled = false;
    void searchCheckoutCities(debouncedBelarusCityQuery)
      .then((r) => {
        if (!cancelled) {
          setBelarusCityHits(r.data || []);
          setBelarusCityLookupFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBelarusCityHits([]);
          setBelarusCityLookupFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [belarusManualCity, debouncedBelarusCityQuery, deliveryCity, deliveryMethod]);

  useEffect(() => {
    if (activeLine === null || debouncedProductQ.trim().length < 2) {
      setProductHits([]);
      setProductHitsLoading(false);
      return;
    }
    let cancelled = false;
    setProductHitsLoading(true);
    void smartSearchProductsWithFallback({ q: debouncedProductQ.trim(), limit: 12 })
      .then((r) => {
        if (!cancelled) setProductHits(r.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setProductHits([]);
      })
      .finally(() => {
        if (!cancelled) setProductHitsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeLine, debouncedProductQ]);

  const subtotal = useMemo(
    () => lines.reduce((a, l) => a + Math.max(0, l.qty) * Math.max(0, l.price), 0),
    [lines],
  );
  const total = subtotal + Math.max(0, deliveryFee);

  const selectPhoneHit = (u: AdminUser) => {
    const d = digitsOnly(u.phone ?? "");
    setNationalNumber(d.startsWith(PHONE_PREFIX) ? d.slice(PHONE_PREFIX.length) : d.slice(-9));
    setCustomerName(u.name ?? "");
    setPhoneHitsOpen(false);
  };

  const loadProductDetail = async (productId: number): Promise<ProductAdminDetail> => {
    const cached = detailsByProductId[productId];
    if (cached) return cached;
    const response = await fetchProductById(productId);
    setDetailsByProductId((prev) => ({ ...prev, [productId]: response.data }));
    return response.data;
  };

  const openProductPicker = (lineIdx: number) => {
    if (itemsLocked) return;
    setActiveLine(lineIdx);
    setPickerProductId(null);
    const row = lines[lineIdx];
    setProductQuery(row.product_name || "");
  };

  const pickProductForLine = async (lineIdx: number, hit: ProductSmartSearchItem) => {
    if (itemsLocked) return;
    setLoadingProductLineIdx(lineIdx);
    setProductHits([]);
    try {
      const detail = await loadProductDetail(hit.id);
      setPickerProductId(hit.id);
      setProductQuery(detail.name);
      setLines((prev) =>
        prev.map((row, i) =>
          i === lineIdx
            ? {
              ...row,
              product_id: detail.id,
              product_name: detail.name,
              product_slug: detail.slug,
              brand_name: detail.brand?.name ?? null,
              variant_id: null,
              variant_title: "",
              sku: null,
              price: 0,
            }
            : row,
        ),
      );
    } finally {
      setLoadingProductLineIdx(null);
    }
  };

  const pickVariantForLine = (lineIdx: number, detail: ProductAdminDetail, variantId: number) => {
    if (itemsLocked) return;
    const v = detail.variants?.find((x) => x.id === variantId);
    if (!v) return;
    setLines((prev) =>
      prev.map((row, i) =>
        i === lineIdx
          ? {
            ...row,
            variant_id: v.id,
            variant_title: v.title || v.display_name || "",
            sku: v.display_name ?? row.sku,
            price: Number(v.price ?? 0),
          }
          : row,
      ),
    );
    setActiveLine(null);
    setPickerProductId(null);
    setProductQuery("");
    setProductHits([]);
  };

  const setLineQty = (idx: number, qty: number) => {
    if (itemsLocked) return;
    setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, qty: Math.max(1, qty) } : row)));
  };

  const removeLine = (idx: number) => {
    if (itemsLocked) return;
    setLines((prev) => (prev.length <= 1 ? [emptyLine()] : prev.filter((_, i) => i !== idx)));
  };

  const addLine = () => {
    if (itemsLocked) return;
    setLines((prev) => [...prev, emptyLine()]);
  };

  const resolvedCity = useMemo(() => {
    if (citySelect === "__new__") return deliveryCity.trim();
    if (citySelect) return citySelect;
    return deliveryCity.trim();
  }, [citySelect, deliveryCity]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const phoneDigits = fullPhoneFromNational(nationalNumber);
    if (!isValidBelarusMobileNational(nationalNumber)) {
      setError("Введите 9 цифр после +375 (код 25, 29, 33 или 44)");
      return;
    }
    if (lines.some((l) => !l.product_id || !l.variant_id || !l.product_name.trim())) {
      setError("У каждой позиции выберите товар и вариант с наличием");
      return;
    }
    if (deliveryMethod !== "pickup") {
      if (!deliveryAddress.trim()) {
        setError("Укажите адрес доставки");
        return;
      }
      if (deliveryMethod === "belarus_courier" && !resolvedCity) {
        setError("Укажите населённый пункт");
        return;
      }
    }

    const addr =
      deliveryMethod === "pickup" ? "нет - самовывоз" : deliveryAddress.trim();

    const payload: AdminOrderPayload = {
      customer_name: customerName.trim() || null,
      phone: phoneDigits,
      comment: comment.trim() || null,
      delivery_method: deliveryMethod,
      delivery_city: deliveryMethod === "pickup" ? null : resolvedCity || null,
      delivery_address: addr,
      delivery_fee: Math.max(0, Number(deliveryFee) || 0),
      payment_method: paymentMethod,
      items: lines.map((item) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_name: item.product_name.trim(),
        product_slug: item.product_slug,
        brand_name: item.brand_name,
        variant_title: item.variant_title.trim(),
        sku: item.sku,
        qty: Math.max(1, item.qty),
        price: Math.max(0, item.price),
      })),
    };

    setSaving(true);
    try {
      if (isEdit && initialOrder) {
        await updateOrder(initialOrder.id, payload);
      } else {
        await createOrder({ ...payload, status: "new" });
      }
      router.push("/admin/orders");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : isEdit ? "Не удалось сохранить заказ" : "Не удалось создать заказ");
    } finally {
      setSaving(false);
    }
  };

  const savedCities = context?.delivery_cities ?? [];
  const showCitySelect = savedCities.length > 0 && deliveryMethod !== "pickup";

  const nationalLive = clampNationalDigits(nationalNumber);
  const nationalDebounced = clampNationalDigits(debouncedNational);
  const showPhoneClientPanel =
    phoneHitsOpen && nationalLive.length >= PHONE_CLIENT_HINT_MIN_NATIONAL;
  const hasOrderHistoryByPhone = totalOrdersCount(context) > 0;

  const belarusCitySearch = (
    <div className="relative">
      {belarusManualCity ? (
        <div className="space-y-2">
          <input
            value={deliveryCity}
            onChange={(e) => setDeliveryCity(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            placeholder="Город / посёлок"
          />
          <button
            type="button"
            className="text-xs text-gray-500 underline"
            onClick={() => {
              setBelarusManualCity(false);
              const t = deliveryCity.trim();
              setDeliveryCity("");
              setBelarusCityQuery(t.includes(",") ? t.slice(0, t.indexOf(",")).trim() : t);
              setBelarusCityOpen(true);
            }}
          >
            Вернуться к поиску
          </button>
        </div>
      ) : (
        <>
          <input
            value={deliveryCity.trim() || belarusCityQuery}
            onChange={(e) => {
              const v = e.target.value;
              setBelarusCityQuery(v);
              if (deliveryCity.trim()) {
                setDeliveryCity("");
              }
              setBelarusCityOpen(true);
              setBelarusCityLookupFailed(false);
            }}
            onFocus={() => setBelarusCityOpen(true)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            placeholder="Поиск по Беларуси"
          />
          {belarusCityOpen && belarusCityHits.length > 0 ? (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-200 bg-white text-sm shadow-lg">
              {belarusCityHits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-gray-50"
                    onClick={() => {
                      setDeliveryCity(h.full_name.trim());
                      setBelarusCityQuery("");
                      setBelarusCityOpen(false);
                    }}
                  >
                    <div className="font-medium text-gray-900">{h.full_name}</div>
                    {h.type ? (
                      <div className="text-xs text-gray-500">
                        {h.type}
                        {h.region_name ? ` · ${h.region_name}` : ""}
                      </div>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {!deliveryCity.trim() &&
          belarusCityQuery.trim().length >= 2 &&
          belarusCityHits.length === 0 ? (
            <div className="mt-2">
              <p className="mb-1 text-xs text-gray-500">
                {belarusCityLookupFailed
                  ? "Поиск временно недоступен."
                  : "Населённый пункт не найден в списке."}
              </p>
              <button
                type="button"
                className="text-xs text-gray-500 underline"
                onClick={() => {
                  setBelarusManualCity(true);
                  setDeliveryCity(
                    (belarusCityQuery.trim() || deliveryCity.trim()).trim(),
                  );
                  setBelarusCityQuery("");
                  setBelarusCityOpen(false);
                }}
              >
                Ввести вручную
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <SectionCard>
        <h2 className="text-sm font-semibold text-gray-900">Клиент</h2>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="relative">
            <label className="block text-sm text-gray-600">Телефон *</label>

            <div className="mt-1 flex w-full items-stretch overflow-hidden rounded-xl border border-gray-200 bg-white">
              <span className="flex shrink-0 items-center border-r border-gray-200 bg-gray-50 px-3 text-sm text-gray-600">
                +375
              </span>
              <input
                value={formatNationalDisplay(nationalNumber)}
                onChange={(e) => {
                  setNationalNumber(clampNationalDigits(e.target.value));
                  setPhoneHitsOpen(true);
                }}
                onFocus={() => setPhoneHitsOpen(true)}
                onBlur={() => setTimeout(() => setPhoneHitsOpen(false), 150)}
                className="min-w-0 flex-1 border-0 px-3 py-2 text-sm outline-none ring-0 focus:ring-0"
                placeholder="29 123-45-67"
                inputMode="numeric"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>

            {showPhoneClientPanel ? (
              <div className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                {phoneHitsLoading || nationalDebounced.length < PHONE_CLIENT_HINT_MIN_NATIONAL ? (
                  <div className="px-3 py-2 text-xs text-gray-500">Поиск клиентов…</div>
                ) : phoneHits.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-500">
                    {hasOrderHistoryByPhone
                      ? `Клиент не зарегистрирован, но есть заказов: ${totalOrdersCount(context)}`
                      : "Клиенты не найдены"}
                  </div>
                ) : (
                  phoneHits.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-gray-50"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => selectPhoneHit(u)}
                    >
                      <span className="font-medium text-gray-900">{u.phone}</span>

                      {u.name ? <span className="text-xs text-gray-500">{u.name}</span> : null}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <label className="block text-sm text-gray-600">
            Имя

            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              placeholder={
                context?.matched_user
                  ? "Из профиля или вручную"
                  : "Для нового номера — введите вручную"
              }
            />
          </label>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 text-xs text-gray-700">
          {contextLoading ? (
            <span>Загрузка данных…</span>
          ) : context ? (
            <div className="grid gap-1.5 sm:grid-cols-2">
              <div>
                <button
                  type="button"
                  onClick={() => setCompletedOrdersOpen(true)}
                  disabled={context.orders.completed <= 0}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
                >
                  Выполнено: {context.orders.completed}
                </button>
              </div>
              <div>
                Отменено: <span className="font-medium text-gray-900">{context.orders.cancelled}</span>
              </div>
              <div>
                Активные: <span className="font-medium text-gray-900">{context.orders.active}</span>
              </div>
              <div>
                {context.discount_cards.length ? (
                  <>
                    Карта:{" "}
                    <span className="font-mono font-medium text-gray-900">
                      {context.discount_cards.map((c) => `${c.number} (${c.discount_percent}%)`).join(", ")}
                    </span>
                  </>
                ) : (
                  <span className="text-gray-500">Скидочная карта не привязана</span>
                )}
              </div>
            </div>
          ) : (
            <span className="text-gray-500">Информация о заказах и скидочной карте по клиенту.</span>
          )}
        </div>
      </SectionCard>

      <SectionCard>
        <h2 className="text-sm font-semibold text-gray-900">Доставка и оплата</h2>
        <fieldset>
          <legend className="mb-2 text-sm text-gray-600">Способ доставки *</legend>
          <div className="space-y-2 text-sm">
            {DELIVERY_OPTIONS.map(({ value, label }) => (
              <label key={value} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="delivery_method"
                  checked={deliveryMethod === value}
                  onChange={() => handleDeliveryMethodChange(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {deliveryMethod !== "pickup" ? (
          <>
            {showCitySelect ? (
              <div className="space-y-2">
                <label className="block text-sm text-gray-600">Населённый пункт</label>
                <select
                  value={citySelect}
                  onChange={(e) => setCitySelect(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="">Выберите город из заказов или другой</option>
                  {savedCities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="__new__">Другой (ввести вручную)</option>
                </select>
                {(citySelect === "__new__" || !citySelect) &&
                  (deliveryMethod === "belarus_courier" ? (
                    belarusCitySearch
                  ) : (
                    <input
                      value={deliveryCity}
                      onChange={(e) => setDeliveryCity(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                      placeholder="Город (если не из списка)"
                    />
                  ))}
              </div>
            ) : deliveryMethod === "belarus_courier" ? (
              <div>
                <div className="text-sm text-gray-600">Населённый пункт</div>
                <div className="mt-1">{belarusCitySearch}</div>
              </div>
            ) : (
              <label className="block text-sm text-gray-600">
                Населённый пункт
                <input
                  value={deliveryCity}
                  onChange={(e) => setDeliveryCity(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  placeholder="Город"
                />
              </label>
            )}

            <label className="block text-sm text-gray-600">
              Адрес доставки *
              <textarea
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                placeholder="Улица, дом, подъезд…"
              />
            </label>
          </>
        ) : (
          <p className="text-xs text-gray-500">Самовывоз — адрес в заказе будет «нет - самовывоз».</p>
        )}

        <fieldset>
          <legend className="mb-2 text-sm text-gray-600">Способ оплаты *</legend>
          <div className="space-y-2 text-sm">
            {PAYMENT_OPTIONS.map(({ value, label }) => (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-2 ${value === "card" && deliveryMethod === "belarus_courier" ? "opacity-40" : ""}`}
              >
                <input
                  type="radio"
                  name="payment_method"
                  value={value}
                  checked={paymentMethod === value}
                  disabled={value === "card" && deliveryMethod === "belarus_courier"}
                  onChange={() => setPaymentMethod(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm text-gray-600">
          Доставка (руб.)
          <input
            type="number"
            min={0}
            step="0.01"
            value={deliveryFee}
            onChange={(e) => setDeliveryFee(Number(e.target.value))}
            className="mt-1 w-full max-w-xs rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-sm text-gray-600">
          Комментарий
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </label>
      </SectionCard>

      <SectionCard>
        <h2 className="text-sm font-semibold text-gray-900">Товары *</h2>
        {itemsLocked ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Заказ в статусе «Выполнен» или «Отменён» — состав строк и цены нельзя менять. Можно править контакты, доставку
            и комментарий.
          </p>
        ) : null}
        {lines.map((line, idx) => {
          const detail = line.product_id ? detailsByProductId[line.product_id] : undefined;
          const inStock = variantsInStock(detail);
          const showPicker = activeLine === idx;
          /** Сразу после выбора товара из выпадающего списка — прячем результаты поиска, пока не выбран вариант (или не сбросили picker фокусом). */
          const variantSelectionFromHit = Boolean(
            line.product_id &&
            !line.variant_id &&
            pickerProductId != null &&
            pickerProductId === line.product_id,
          );
          const showProductHitList =
            showPicker &&
            loadingProductLineIdx !== idx &&
            !variantSelectionFromHit &&
            (productHitsLoading || productHits.length > 0 || debouncedProductQ.trim().length >= 2);

          return (
            <div key={`line-${idx}`} className="rounded-xl border border-gray-100 p-3">
              {line.product_id && line.variant_id ? (
                itemsLocked ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div>
                      <div className="font-medium text-gray-900">{line.product_name}</div>
                      <div className="text-xs text-gray-600">
                        {line.brand_name ? `${line.brand_name} · ` : ""}
                        {line.variant_title} · {line.price} руб. ×{" "}
                        <span className="inline-block min-w-[2.5rem] rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-center tabular-nums">
                          {line.qty}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div>
                      <div className="font-medium text-gray-900">{line.product_name}</div>
                      <div className="text-xs text-gray-600">
                        {line.brand_name ? `${line.brand_name} · ` : ""}
                        {line.variant_title} · {line.price} руб. ×{" "}
                        <input
                          type="number"
                          min={1}
                          className="w-14 rounded border px-1 py-0.5 text-center"
                          value={line.qty}
                          onChange={(e) => setLineQty(idx, Number(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-700"
                        onClick={() => removeLine(idx)}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                )
              ) : itemsLocked ? (
                <div className="text-xs text-gray-500">Позиция {idx + 1} — данные строки недоступны для редактирования.</div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500">Позиция {idx + 1}</div>
                  <div className="relative">
                    <input
                      value={showPicker ? productQuery : line.product_name}
                      onFocus={() => openProductPicker(idx)}
                      onChange={(e) => {
                        openProductPicker(idx);
                        setProductQuery(e.target.value);
                      }}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                      placeholder="Название, артикул или код товара"
                    />
                    {showProductHitList ? (
                      <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                        {productHitsLoading ? (
                          <div className="px-3 py-2 text-xs text-gray-500">Поиск…</div>
                        ) : productHits.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-gray-500">Ничего не найдено</div>
                        ) : (
                          productHits.map((hit) => {
                            const q = productQuery.trim();
                            const preview =
                              hit.variants_preview && hit.variants_preview.length > 0
                                ? hit.variants_preview
                                : (hit.variant_titles ?? []).map((title) => ({
                                  title,
                                  availability: "",
                                  available_stock: 0,
                                  is_available: false,
                                  is_preorder: false,
                                }));
                            return (
                              <button
                                key={hit.id}
                                type="button"
                                className="block w-full border-b border-gray-50 px-3 py-2 text-left text-sm last:border-0 hover:bg-gray-50"
                                onMouseDown={(ev) => ev.preventDefault()}
                                onClick={() => void pickProductForLine(idx, hit)}
                              >
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                  <span className="shrink-0 text-xs text-gray-400 tabular-nums">
                                    {highlightQueryInText(String(hit.id), q)}&nbsp;
                                  </span>
                                  <span className="min-w-0 font-medium text-gray-900">
                                    {highlightQueryInText(hit.name, q)}
                                  </span>
                                  {hit.brand_name ? (
                                    <span className="min-w-0 text-xs font-normal text-gray-500">
                                      {highlightQueryInText(hit.brand_name, q)}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-1 space-y-1 text-xs">
                                  {preview.slice(0, 3).map((row, rowIdx) => (
                                    <div
                                      key={`${hit.id}-v-${rowIdx}`}
                                      className="flex flex-col gap-0.5 rounded-md bg-gray-50/80 px-2 py-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2"
                                    >
                                      <span className="min-w-0 text-gray-800">
                                        {highlightQueryInText(row.title, q)}
                                      </span>
                                      {row.availability ? (
                                        <span
                                          className={`shrink-0 text-[10px] leading-snug sm:max-w-[55%] sm:text-right ${row.is_preorder
                                            ? "text-amber-800"
                                            : row.is_available
                                              ? "text-emerald-800"
                                              : "text-gray-500"
                                            }`}
                                        >
                                          {highlightQueryInText(row.availability, q)}
                                        </span>
                                      ) : (
                                        <span className="shrink-0 text-[10px] text-gray-400">Наличие не загружено</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </div>

                  {pickerProductId && line.product_id === pickerProductId && detail ? (
                    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-2">
                      <div className="mb-1 text-xs font-medium text-gray-600">Вариант с наличием</div>
                      <div className="flex flex-wrap gap-1.5">
                        {(inStock.length ? inStock : detail.variants ?? []).map((v) => {
                          const tipLine2 = v.fulfillment_tooltip?.trim() ?? "";
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onMouseEnter={(e) => {
                                const r = e.currentTarget.getBoundingClientRect();
                                setVariantTooltip({
                                  x: r.left + r.width / 2,
                                  y: r.top,
                                  product: detail.name,
                                  line2: tipLine2 || "Канал отгрузки не указан",
                                });
                              }}
                              onMouseLeave={() => setVariantTooltip(null)}
                              onFocus={(e) => {
                                const r = e.currentTarget.getBoundingClientRect();
                                setVariantTooltip({
                                  x: r.left + r.width / 2,
                                  y: r.top,
                                  product: detail.name,
                                  line2: tipLine2 || "Канал отгрузки не указан",
                                });
                              }}
                              onBlur={() => setVariantTooltip(null)}
                              onClick={() => pickVariantForLine(idx, detail, v.id)}
                              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-left text-xs hover:border-gray-400"
                            >
                              <div className="font-medium text-gray-900">{v.title || v.display_name}</div>
                              <div className="text-gray-500">
                                {v.price != null ? `${v.price} руб.` : "нет в наличии"}
                                {typeof v.available_stock === "number" ? ` · ост. ${v.available_stock}` : ""}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={addLine}
          disabled={itemsLocked}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Добавить позицию
        </button>
      </SectionCard>

      {isEdit && initialOrder?.gift_certificate_purchases ? (
        <CertificatesPanel
          title="Купленные подарочные сертификаты"
          wrapperClassName="space-y-2 rounded-2xl border border-violet-100 bg-violet-50/40 p-4"
          items={initialOrder.gift_certificate_purchases}
          renderItem={(row) => (
            <li key={row.id} className="rounded-xl border border-violet-100 bg-white px-3 py-2">
              <div className="font-medium text-gray-900">{row.template_title}</div>
              <div className="mt-0.5 text-xs text-gray-600">
                Номинал {row.amount} руб. × {row.qty} шт. — всего {row.total} руб.
              </div>
            </li>
          )}
          footer="Строки из оформления заказа; после «Выполнен» код вносит менеджер в карточке сертификата."
        />
      ) : null}

      {isEdit && initialOrder?.sold_gift_certificates ? (
        <CertificatesPanel
          title="Выпущенные сертификаты по заказу"
          wrapperClassName="space-y-2 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4"
          items={initialOrder.sold_gift_certificates}
          renderItem={(row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2"
            >
              <div>
                <div className="font-mono text-xs text-gray-500">ID {row.id}</div>
                <div className="font-medium text-gray-900">{row.template_title ?? "Сертификат"}</div>
                <div className="text-xs text-gray-600">
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
          )}
        />
      ) : null}

      <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
        <div>Сумма товаров: {subtotal.toFixed(2)} руб.</div>
        <div>Итого: {total.toFixed(2)} руб.</div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      {typeof document !== "undefined" && variantTooltip
        ? createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[9999] w-max max-w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-2 text-left text-[11px] leading-snug text-white shadow-xl ring-1 ring-black/10"
            style={{
              left: variantTooltip.x,
              top: variantTooltip.y,
              transform: "translate(-50%, calc(-100% - 8px))",
            }}
          >
            <div className="font-medium text-white">{variantTooltip.product}</div>
            <div className="mt-1 text-white/90">{variantTooltip.line2}</div>
            <span
              aria-hidden
              className="absolute left-1/2 top-full -mt-px h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-gray-900"
            />
          </div>,
          document.body,
        )
        : null}

      {context && completedOrdersOpen && typeof document !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4">
            <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">Выполненные заказы по номеру</h3>
                <button
                  type="button"
                  onClick={() => setCompletedOrdersOpen(false)}
                  className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Закрыть
                </button>
              </div>
              <div className="max-h-[72vh] overflow-auto p-4">
                {context.completed_orders.length === 0 ? (
                  <p className="text-sm text-gray-500">Выполненные заказы не найдены.</p>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="px-3 py-2">№ заказа</th>
                        <th className="px-3 py-2">Дата</th>
                        <th className="px-3 py-2">Что заказано</th>
                        <th className="px-3 py-2 text-right">Кол-во</th>
                        <th className="px-3 py-2 text-right">Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      {context.completed_orders.map((order) => (
                        <tr key={order.id} className="border-b last:border-b-0">
                          <td className="px-3 py-2 font-medium text-gray-900">
                            <a
                              href={`/admin/orders/${order.id}/edit`}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-blue-700 underline underline-offset-2 hover:text-blue-800"
                            >
                              #{order.id}
                            </a>
                          </td>
                          <td className="px-3 py-2">{formatDateTime(order.created_at)}</td>
                          <td className="px-3 py-2">
                            <div className="space-y-1">
                              {(order.items ?? []).length === 0 ? (
                                <span className="text-xs text-gray-500">—</span>
                              ) : (
                                (order.items ?? []).map((item, idx) => (
                                  <div key={`${order.id}-item-${idx}`} className="text-xs text-gray-700">
                                    <span className="font-medium text-gray-900">{item.product_name || "Товар"}</span>
                                    {item.variant_title ? ` · ${item.variant_title}` : ""}
                                    {item.qty > 0 ? ` × ${item.qty}` : ""}
                                  </div>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{order.items_qty}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{order.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded-xl bg-black px-5 py-2.5 text-sm text-white disabled:opacity-50">
          {saving ? (isEdit ? "Сохранение…" : "Создание…") : isEdit ? "Сохранить изменения" : "Создать заказ"}
        </button>
        <button type="button" onClick={() => router.push("/admin/orders")} className="rounded-xl border px-4 py-2 text-sm">
          Отмена
        </button>
      </div>
    </form>
  );
}

"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createOrder,
  fetchAdminOrderCustomerContext,
  fetchAdminOrderQuote,
  updateOrder,
  type AdminOrderCustomerContext,
  type AdminOrderPayload,
  type AdminOrderQuote,
} from "@/lib/admin-orders-api";
import { giftCertificateStatusLabel } from "@/lib/admin-loyalty-api";
import type { OrderData } from "@/types/orders";
import {
  fetchProductById,
  flattenProductSmartSearchHits,
  productSmartSearchAvailabilityClass,
  productSmartSearchAvailabilityLabel,
  productSmartSearchPriceLabel,
  productSmartSearchShowsPrice,
  smartSearchProductsWithFallback,
  type ProductAdminDetail,
  type ProductSmartSearchItem,
  type ProductSmartSearchVariantPreview,
} from "@/lib/admin-products-api";
import { fetchAdminUsers, type AdminUser } from "@/lib/admin-users-api";
import useDebouncedValue from "@/hooks/use-debounced-value";
import { clampBelarusNationalDigits } from "@/lib/belarus-phone-national";
import { searchCheckoutCities, type CheckoutCityHit } from "@/lib/checkout-api";
import { formatMoneyRub } from "@/lib/format-money-display";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import type { AdminOrderCustomerContextOrderRow } from "@/lib/admin-orders-api";

const DELIVERY_OPTIONS = [
  { value: "minsk_courier", label: "Курьер по Минску" },
  { value: "belarus_courier", label: "Курьер по РБ" },
  { value: "pickup", label: "Самовывоз" },
] as const;

/** Для «Курьер по Минску» населённый пункт в заказе всегда фиксирован. */
const MINSK_COURIER_CITY = "Минск";

const PAYMENT_OPTIONS = [
  { value: "cash", label: "Наличными" },
  { value: "card", label: "Картой (Visa и MasterCard)" },
] as const;

const clientFieldClass =
  "w-full rounded-lg border border-admin-border bg-admin-bg px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-secondary/70 outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/20";

const orderLineTableGrid =
  "grid grid-cols-[minmax(0,1fr)_2.75rem_5.75rem_6.5rem_2rem] items-center gap-x-3";

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

/** Только 9 цифр после +375 (код оператора + номер); при вставке с 375 префикс отбрасывается. */
function clampNationalDigits(s: string): string {
  return clampBelarusNationalDigits(s);
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

type CustomerNameParts = {
  first: string;
  last: string;
  patronymic: string;
};

function parseCustomerNameParts(full: string): CustomerNameParts {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "", patronymic: "" };
  if (parts.length === 1) return { first: parts[0], last: "", patronymic: "" };
  if (parts.length === 2) return { first: parts[0], last: parts[1], patronymic: "" };
  return { first: parts[0], last: parts[1], patronymic: parts.slice(2).join(" ") };
}

function buildCustomerName(parts: CustomerNameParts): string {
  return [parts.first, parts.last, parts.patronymic]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

type OrdersHistoryModalKind = "completed" | "active" | "cancelled";

const ORDERS_HISTORY_MODAL_TITLES: Record<OrdersHistoryModalKind, string> = {
  completed: "Выполненные заказы по номеру",
  active: "Активные заказы по номеру",
  cancelled: "Отменённые заказы по номеру",
};

function ordersForHistoryModal(
  context: AdminOrderCustomerContext,
  kind: OrdersHistoryModalKind,
): AdminOrderCustomerContextOrderRow[] {
  if (kind === "completed") return context.completed_orders;
  if (kind === "active") return context.active_orders ?? [];
  return context.cancelled_orders ?? [];
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

function orderLineMerchandiseTotal(line: OrderLine): number {
  return Math.max(0, line.qty) * Math.max(0, line.price);
}

function isCompleteOrderLine(l: OrderLine): boolean {
  return Boolean(l.product_id && l.variant_id && l.product_name.trim());
}

/** Строка «Позиция N», в которую ничего не ввели — не валидируем и не отправляем. */
function isBlankOrderLine(l: OrderLine): boolean {
  return !l.product_id && !l.variant_id && !l.product_name.trim();
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

/** Все варианты товара для ручного заказа; сначала с наличием / предзаказом. */
function orderableProductVariants(detail: ProductAdminDetail | undefined) {
  const list = detail?.variants ?? [];
  return [...list].sort((a, b) => {
    const score = (v: (typeof list)[number]) => (v.is_available || v.is_preorder ? 1 : 0);
    return score(b) - score(a);
  });
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
      <mark key={`h-${idx}-${n}`} className="rounded-sm bg-amber-200 px-0.5 text-admin-text">
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
  initialCustomerName?: string;
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
  return (
    <section className="space-y-4 rounded-2xl border border-admin-border bg-admin-surface p-5 shadow-admin-card">
      {children}
    </section>
  );
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
      {footer ? <p className="text-xs text-admin-text-secondary">{footer}</p> : null}
    </div>
  );
}

export default function AdminOrderCreateForm({
  mode = "create",
  initialOrder,
  initialPhone,
  initialCustomerName,
}: AdminOrderCreateFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit" && initialOrder != null;
  const itemsLocked = Boolean(
    isEdit && initialOrder && (initialOrder.status === "done" || initialOrder.status === "cancelled"),
  );

  /** Только цифры после +375 (9 шт.: 25/29/33/44 + номер). */
  const [nationalNumber, setNationalNumber] = useState(() =>
    initialOrder?.phone ? nationalFromStoredPhone(initialOrder.phone) : nationalFromStoredPhone(initialPhone ?? ""),
  );
  const [customerFirstName, setCustomerFirstName] = useState(
    () =>
      parseCustomerNameParts(
        initialOrder?.customer_name?.trim() || initialCustomerName?.trim() || "",
      ).first,
  );
  const [customerLastName, setCustomerLastName] = useState(
    () =>
      parseCustomerNameParts(
        initialOrder?.customer_name?.trim() || initialCustomerName?.trim() || "",
      ).last,
  );
  const [customerPatronymic, setCustomerPatronymic] = useState(
    () =>
      parseCustomerNameParts(
        initialOrder?.customer_name?.trim() || initialCustomerName?.trim() || "",
      ).patronymic,
  );
  const [comment, setComment] = useState(() => initialOrder?.comment ?? "");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryValue>(() => normalizeDelivery(initialOrder?.delivery_method));
  const [deliveryCity, setDeliveryCity] = useState(() => {
    const method = normalizeDelivery(initialOrder?.delivery_method);
    if (method === "minsk_courier") return MINSK_COURIER_CITY;
    return initialOrder?.delivery_city ?? "";
  });
  const [citySelect, setCitySelect] = useState<string>("");
  const [deliveryAddress, setDeliveryAddress] = useState(() => initialOrder?.delivery_address ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentValue>(() => normalizePayment(initialOrder?.payment_method));
  const [deliveryFee, setDeliveryFee] = useState(() => Math.max(0, Number(initialOrder?.delivery_fee ?? 0) || 0));
  const [discountCardInput, setDiscountCardInput] = useState(() => initialOrder?.discount_card_number?.trim() ?? "");
  const [appliedDiscountCardNumber, setAppliedDiscountCardNumber] = useState(
    () => initialOrder?.discount_card_number?.trim() ?? "",
  );
  /** Пользователь явно убрал карту — не подставлять снова, пока не сменится телефон. */
  const [discountCardManuallyCleared, setDiscountCardManuallyCleared] = useState(false);
  const [discountCardError, setDiscountCardError] = useState("");
  const [orderQuote, setOrderQuote] = useState<AdminOrderQuote | null>(null);
  const [orderQuoteLoading, setOrderQuoteLoading] = useState(false);
  const [lines, setLines] = useState<OrderLine[]>(() => (initialOrder ? linesFromOrderItems(initialOrder) : [emptyLine()]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [phoneHits, setPhoneHits] = useState<AdminUser[]>([]);
  const [phoneHitsOpen, setPhoneHitsOpen] = useState(false);
  const [phoneHitsLoading, setPhoneHitsLoading] = useState(false);

  const [context, setContext] = useState<AdminOrderCustomerContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [ordersHistoryModal, setOrdersHistoryModal] = useState<OrdersHistoryModalKind | null>(null);

  const debouncedNational = useDebouncedValue(nationalNumber, 280);

  const [activeLine, setActiveLine] = useState<number | null>(null);
  const activeProductSearchQ = activeLine !== null ? (lines[activeLine]?.product_name ?? "") : "";
  const debouncedProductQ = useDebouncedValue(activeProductSearchQ, 250);
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
  const productPickerRef = useRef<HTMLDivElement>(null);
  /** Не перезаписывать имя повторно для того же телефона после ручного ввода. */
  const autoCustomerNamePhoneRef = useRef<string>("");

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
    if (!pickerProductId) setVariantTooltip(null);
  }, [pickerProductId]);

  useEffect(() => {
    if (!itemsLocked) return;
    setActiveLine(null);
    setProductHits([]);
    setPickerProductId(null);
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
    if (value === "minsk_courier") {
      setDeliveryCity(MINSK_COURIER_CITY);
      setCitySelect("");
      setBelarusCityQuery("");
      setBelarusCityHits([]);
      setBelarusCityOpen(false);
      setBelarusManualCity(false);
    } else if (value === "belarus_courier") {
      setPaymentMethod((pm) => (pm === "card" ? "cash" : pm));
      setCitySelect("");
      setDeliveryCity((prev) => (prev.trim() === MINSK_COURIER_CITY ? "" : prev));
      setBelarusCityQuery("");
      setBelarusCityHits([]);
      setBelarusCityOpen(false);
      setBelarusManualCity(false);
    } else if (value === "pickup") {
      setDeliveryAddress("");
      setDeliveryCity("");
      setCitySelect("");
      setBelarusCityQuery("");
      setBelarusCityHits([]);
      setBelarusCityOpen(false);
      setBelarusManualCity(false);
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
    void fetchAdminUsers({ search: full })
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
    const nat = clampNationalDigits(debouncedNational);
    if (nat.length !== 9) {
      autoCustomerNamePhoneRef.current = "";
      return;
    }

    const phoneKey = fullPhoneFromNational(nat);
    const suggested =
      context?.matched_user?.name?.trim() || context?.customer_name?.trim() || "";
    if (!suggested) return;

    const initialNat = initialOrder?.phone ? nationalFromStoredPhone(initialOrder.phone) : "";
    if (initialOrder && nat === initialNat) {
      autoCustomerNamePhoneRef.current = phoneKey;
      return;
    }

    if (autoCustomerNamePhoneRef.current === phoneKey) return;

    const parts = parseCustomerNameParts(suggested);
    setCustomerFirstName(parts.first);
    setCustomerLastName(parts.last);
    setCustomerPatronymic(parts.patronymic);
    autoCustomerNamePhoneRef.current = phoneKey;
  }, [context?.matched_user?.name, context?.customer_name, debouncedNational, initialOrder]);

  useEffect(() => {
    setDiscountCardManuallyCleared(false);
    const nat = clampNationalDigits(debouncedNational);
    const initialNat = initialOrder?.phone ? nationalFromStoredPhone(initialOrder.phone) : "";
    if (initialOrder && nat === initialNat) {
      return;
    }
    setAppliedDiscountCardNumber("");
    setDiscountCardInput("");
    setDiscountCardError("");
  }, [debouncedNational, initialOrder]);

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

  const filledLinesForQuote = useMemo(() => lines.filter(isCompleteOrderLine), [lines]);

  const quoteItemsKey = useMemo(
    () => JSON.stringify(filledLinesForQuote.map((l) => ({ qty: l.qty, price: l.price }))),
    [filledLinesForQuote],
  );

  useEffect(() => {
    if (filledLinesForQuote.length === 0) {
      queueMicrotask(() => {
        setOrderQuote(null);
        setDiscountCardError("");
        setOrderQuoteLoading(false);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      setOrderQuoteLoading(true);
    });
    void fetchAdminOrderQuote({
      payment_method: paymentMethod,
      discount_card_number: appliedDiscountCardNumber.trim() || null,
      delivery_fee: Math.max(0, Number(deliveryFee) || 0),
      items: filledLinesForQuote.map((l) => ({
        qty: Math.max(1, l.qty),
        price: Math.max(0, l.price),
      })),
    })
      .then((response) => {
        if (!cancelled) {
          setOrderQuote(response.data);
          setDiscountCardError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setOrderQuote(null);
          const msg = err instanceof Error ? err.message : "Не удалось пересчитать скидки";
          setDiscountCardError(msg);
          setAppliedDiscountCardNumber("");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setOrderQuoteLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [quoteItemsKey, paymentMethod, appliedDiscountCardNumber, deliveryFee, filledLinesForQuote]);

  const localSubtotal = useMemo(
    () => filledLinesForQuote.reduce((a, l) => a + Math.max(0, l.qty) * Math.max(0, l.price), 0),
    [filledLinesForQuote],
  );

  const parseQuoteMoney = (value: string | undefined | null): number => {
    const n = Number.parseFloat(String(value ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  const subtotalStr = orderQuote?.subtotal ?? localSubtotal.toFixed(2);
  const loyaltyDiscountStr = orderQuote?.loyalty_discount_amount ?? "0.00";
  const merchandiseTotalStr = orderQuote?.merchandise_total ?? localSubtotal.toFixed(2);
  const orderTotalStr =
    orderQuote?.total ?? (localSubtotal + Math.max(0, Number(deliveryFee) || 0)).toFixed(2);
  const loyaltyPercentStr = orderQuote?.loyalty_discount_percent ?? "0.00";
  const hasLoyaltyDiscount = parseQuoteMoney(loyaltyDiscountStr) > 0.004;

  const discountCardConfirmed = Boolean(
    appliedDiscountCardNumber.trim() &&
    orderQuote?.discount_card_number?.trim() &&
    orderQuote.discount_card_number.trim() === appliedDiscountCardNumber.trim(),
  );

  const applyDiscountCardToOrder = useCallback(
    async (cardNumber: string) => {
      const normalized = cardNumber.trim();
      if (!normalized) {
        return;
      }
      if (filledLinesForQuote.length === 0) {
        setDiscountCardError("Сначала добавьте хотя бы одну позицию в заказ, чтобы применить карту.");
        return;
      }

      setDiscountCardError("");
      setOrderQuoteLoading(true);
      try {
        const response = await fetchAdminOrderQuote({
          payment_method: paymentMethod,
          discount_card_number: normalized,
          delivery_fee: Math.max(0, Number(deliveryFee) || 0),
          items: filledLinesForQuote.map((l) => ({
            qty: Math.max(1, l.qty),
            price: Math.max(0, l.price),
          })),
        });
        const confirmed = response.data.discount_card_number?.trim() ?? "";
        if (confirmed === "") {
          setAppliedDiscountCardNumber("");
          setOrderQuote(null);
          setDiscountCardError("Скидочная карта не найдена или неактивна.");
          return;
        }
        setAppliedDiscountCardNumber(confirmed);
        setDiscountCardInput(confirmed);
        setOrderQuote(response.data);
        setDiscountCardManuallyCleared(false);
      } catch (err) {
        setAppliedDiscountCardNumber("");
        setOrderQuote(null);
        setDiscountCardError(
          err instanceof Error ? err.message : "Скидочная карта не найдена или неактивна.",
        );
      } finally {
        setOrderQuoteLoading(false);
      }
    },
    [deliveryFee, filledLinesForQuote, paymentMethod],
  );

  useEffect(() => {
    if (itemsLocked || discountCardManuallyCleared) {
      return;
    }
    if (appliedDiscountCardNumber.trim() !== "") {
      return;
    }
    const cards = context?.discount_cards ?? [];
    if (cards.length === 0) {
      return;
    }
    const best = cards[0];
    if (!best?.number?.trim()) {
      return;
    }
    setDiscountCardInput(best.number);
    setDiscountCardError("");
    if (filledLinesForQuote.length > 0) {
      void applyDiscountCardToOrder(best.number);
    }
  }, [applyDiscountCardToOrder, context, filledLinesForQuote.length, itemsLocked, discountCardManuallyCleared, appliedDiscountCardNumber]);

  const selectPhoneHit = (u: AdminUser) => {
    const d = digitsOnly(u.phone ?? "");
    setNationalNumber(d.startsWith(PHONE_PREFIX) ? d.slice(PHONE_PREFIX.length) : d.slice(-9));
    const parts = parseCustomerNameParts(u.name ?? "");
    setCustomerFirstName(parts.first);
    setCustomerLastName(parts.last);
    setCustomerPatronymic(parts.patronymic);
    setPhoneHitsOpen(false);
  };

  const loadProductDetail = async (productId: number): Promise<ProductAdminDetail> => {
    const cached = detailsByProductId[productId];
    if (cached) return cached;
    const response = await fetchProductById(productId);
    setDetailsByProductId((prev) => ({ ...prev, [productId]: response.data }));
    return response.data;
  };

  const closeProductPicker = useCallback(() => {
    setActiveLine(null);
    setProductHits([]);
    setPickerProductId(null);
  }, []);

  const productPickerOpen = activeLine !== null || pickerProductId !== null;

  useEffect(() => {
    if (!productPickerOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (productPickerRef.current?.contains(e.target as Node)) return;
      closeProductPicker();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [productPickerOpen, closeProductPicker]);

  const openProductPicker = (lineIdx: number) => {
    if (itemsLocked) return;
    setError("");
    setActiveLine(lineIdx);
    setPickerProductId(null);
  };

  const pickProductVariantFromSearch = async (
    lineIdx: number,
    hit: ProductSmartSearchItem,
    variantPreview: ProductSmartSearchVariantPreview,
  ) => {
    if (itemsLocked) return;
    setLoadingProductLineIdx(lineIdx);
    setProductHits([]);
    try {
      const detail = await loadProductDetail(hit.id);
      const variantId = variantPreview.id;
      const variant =
        (variantId != null ? detail.variants?.find((x) => x.id === variantId) : undefined) ??
        detail.variants?.find(
          (x) => (x.title || x.display_name || "").trim() === variantPreview.title.trim(),
        );
      if (!variant) {
        setError("Вариант не найден — обновите страницу и попробуйте снова.");
        return;
      }
      setError("");
      setLines((prev) =>
        prev.map((row, i) =>
          i === lineIdx
            ? {
              ...row,
              product_id: detail.id,
              product_name: detail.name,
              product_slug: detail.slug,
              brand_name: detail.brand?.name ?? hit.brand_name ?? detail.brand?.name ?? null,
              variant_id: variant.id,
              variant_title: variant.title || variant.display_name || "",
              sku: variant.display_name ?? row.sku,
              price: Number(variant.price ?? variantPreview.price ?? 0),
            }
            : row,
        ),
      );
      setActiveLine(null);
      setPickerProductId(null);
    } finally {
      setLoadingProductLineIdx(null);
    }
  };

  const pickVariantForLine = (lineIdx: number, detail: ProductAdminDetail, variantId: number) => {
    if (itemsLocked) return;
    setVariantTooltip(null);
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
    if (deliveryMethod === "minsk_courier") return MINSK_COURIER_CITY;
    let city = "";
    if (citySelect === "__new__") city = deliveryCity.trim();
    else if (citySelect) city = citySelect.trim();
    else city = deliveryCity.trim();
    if (deliveryMethod === "belarus_courier" && city.includes(",")) {
      return city.slice(0, city.indexOf(",")).trim();
    }
    return city;
  }, [deliveryMethod, citySelect, deliveryCity]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const phoneDigits = fullPhoneFromNational(nationalNumber);
    if (!isValidBelarusMobileNational(nationalNumber)) {
      setError("Введите 9 цифр после +375 (код 25, 29, 33 или 44)");
      return;
    }
    const hasIncompleteLine = lines.some((l) => !isBlankOrderLine(l) && !isCompleteOrderLine(l));
    if (hasIncompleteLine) {
      setError("У каждой позиции выберите товар и вариант");
      return;
    }
    const filledLines = lines.filter(isCompleteOrderLine);
    if (filledLines.length === 0) {
      setError("Добавьте хотя бы одну позицию: выберите товар и вариант");
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
      customer_name:
        buildCustomerName({
          first: customerFirstName,
          last: customerLastName,
          patronymic: customerPatronymic,
        }) || null,
      phone: phoneDigits,
      comment: comment.trim() || null,
      delivery_method: deliveryMethod,
      delivery_city: deliveryMethod === "pickup" ? null : resolvedCity || null,
      delivery_address: addr,
      delivery_fee: Math.max(0, Number(deliveryFee) || 0),
      payment_method: paymentMethod,
      discount_card_number: appliedDiscountCardNumber.trim() || null,
      items: filledLines.map((item) => ({
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
      router.push(isEdit ? "/admin/orders?updated=1" : "/admin/orders?created=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : isEdit ? "Не удалось сохранить заказ" : "Не удалось создать заказ");
    } finally {
      setSaving(false);
    }
  };

  const savedCities = context?.delivery_cities ?? [];
  const showCitySelect =
    savedCities.length > 0 && deliveryMethod !== "pickup" && deliveryMethod !== "belarus_courier";

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
            className="w-full rounded-xl border border-admin-border px-3 py-2 text-sm"
            placeholder="Город / посёлок"
          />
          <button
            type="button"
            className="text-xs text-admin-text-secondary underline"
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
            className="w-full rounded-xl border border-admin-border px-3 py-2 text-sm"
            placeholder="Поиск по Беларуси"
          />
          {belarusCityOpen && belarusCityHits.length > 0 ? (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-admin-border bg-admin-surface text-sm shadow-lg">
              {belarusCityHits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-admin-muted"
                    onClick={() => {
                      const cityName = (h.name_ru || h.name || h.full_name).trim();
                      setDeliveryCity(cityName);
                      setBelarusCityQuery("");
                      setBelarusCityOpen(false);
                    }}
                  >
                    <div className="font-medium text-admin-text">{h.full_name}</div>
                    {h.type ? (
                      <div className="text-xs text-admin-text-secondary">
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
              <p className="mb-1 text-xs text-admin-text-secondary">
                {belarusCityLookupFailed
                  ? "Поиск временно недоступен."
                  : "Населённый пункт не найден в списке."}
              </p>
              <button
                type="button"
                className="text-xs text-admin-text-secondary underline"
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
        <h2 className="text-sm font-semibold text-admin-text">Клиент</h2>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-5">
          <div className="flex w-full shrink-0 flex-col gap-3.5 rounded-xl border border-admin-border/90 bg-admin-muted/50 p-3.5 sm:max-w-[22rem] lg:max-w-[26rem]">
            <div className="relative">
              <label className="mb-1 block text-xs font-medium text-admin-text-secondary">Телефон *</label>

              <div className="flex overflow-hidden rounded-lg border border-admin-border bg-admin-bg transition focus-within:border-admin-primary focus-within:ring-2 focus-within:ring-admin-primary/20">
                <span className="flex shrink-0 items-center border-r border-admin-border px-2.5 text-sm tabular-nums text-admin-text-secondary">
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
                  className="min-w-0 flex-1 border-0 bg-transparent px-2.5 py-2 text-sm text-admin-text outline-none ring-0 placeholder:text-admin-text-secondary/70 focus:ring-0"
                  placeholder="29 123-45-67"
                  inputMode="numeric"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>

              {showPhoneClientPanel ? (
                <div className="absolute z-30 mt-1 max-h-52 w-full min-w-[16rem] overflow-auto rounded-lg border border-admin-border bg-admin-surface py-1 shadow-lg">
                  {phoneHitsLoading || nationalDebounced.length < PHONE_CLIENT_HINT_MIN_NATIONAL ? (
                    <div className="px-3 py-2 text-xs text-admin-text-secondary">Поиск клиентов…</div>
                  ) : phoneHits.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-admin-text-secondary">
                      {hasOrderHistoryByPhone
                        ? (() => {
                            const guestName =
                              context?.customer_name?.trim() ||
                              context?.matched_user?.name?.trim() ||
                              "";
                            return guestName
                              ? `${guestName} · заказов: ${totalOrdersCount(context)}`
                              : `Клиент не зарегистрирован, но есть заказов: ${totalOrdersCount(context)}`;
                          })()
                        : "Клиенты не найдены"}
                    </div>
                  ) : (
                    phoneHits.map((u) => {
                      const hitName = u.name?.trim() || "";
                      return (
                        <button
                          key={u.id}
                          type="button"
                          className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-admin-muted"
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => selectPhoneHit(u)}
                        >
                          <span className="font-medium text-admin-text">
                            {hitName || u.phone}
                          </span>
                          <span className="text-xs text-admin-text-secondary">{u.phone}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>

            <div>
              <div className="grid grid-cols-3 gap-2">
                <div className="min-w-0">
                  <label className="mb-1 block text-[11px] text-admin-text-secondary/90">Имя</label>
                  <input
                    value={customerFirstName}
                    onChange={(e) => setCustomerFirstName(e.target.value)}
                    className={clientFieldClass}
                    placeholder="Иван"
                    autoComplete="off"
                  />
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block text-[11px] text-admin-text-secondary/90">Фамилия</label>
                  <input
                    value={customerLastName}
                    onChange={(e) => setCustomerLastName(e.target.value)}
                    className={clientFieldClass}
                    placeholder="Иванов"
                    autoComplete="off"
                  />
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block text-[11px] text-admin-text-secondary/90">Отчество</label>
                  <input
                    value={customerPatronymic}
                    onChange={(e) => setCustomerPatronymic(e.target.value)}
                    className={clientFieldClass}
                    placeholder="Иванович"
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-h-[6.5rem] min-w-0 flex-1 flex-col rounded-xl bg-admin-muted/55 px-4 py-3.5">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-admin-border/70 pb-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-admin-text-secondary">
                Заказы и скидочная карта
              </span>
              {context?.matched_user ? (
                <span className="rounded-md bg-admin-primary/12 px-2 py-0.5 text-[11px] font-medium text-admin-primary">
                  В базе
                </span>
              ) : context && totalOrdersCount(context) > 0 ? (
                <span className="rounded-md bg-amber-100/80 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                  Гость
                </span>
              ) : null}
            </div>

            {contextLoading ? (
              <p className="text-sm text-admin-text-secondary">Загрузка…</p>
            ) : context ? (
              <div className="flex flex-1 flex-col justify-center gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div className="space-y-2">
                  {totalOrdersCount(context) > 0 ? (
                    <p className="text-[11px] text-admin-text-secondary">
                      Нажмите на счётчик с числом — откроется список заказов
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        {
                          kind: "completed" as const,
                          label: "Выполнено",
                          count: context.orders.completed,
                          countClass: "text-emerald-700",
                        },
                        {
                          kind: "active" as const,
                          label: "Активные",
                          count: context.orders.active,
                          countClass: "text-sky-700",
                        },
                        {
                          kind: "cancelled" as const,
                          label: "Отменено",
                          count: context.orders.cancelled,
                          countClass: "text-admin-text",
                        },
                      ] as const
                    ).map((stat) => {
                      const clickable = stat.count > 0;
                      return (
                        <button
                          key={stat.kind}
                          type="button"
                          disabled={!clickable}
                          onClick={() => setOrdersHistoryModal(stat.kind)}
                          title={clickable ? `Показать: ${stat.label}` : undefined}
                          className={`inline-flex min-w-[5.5rem] flex-col items-start rounded-lg border px-2.5 py-2 text-left transition ${
                            clickable
                              ? "cursor-pointer border-admin-border bg-admin-surface shadow-sm hover:border-admin-primary/40 hover:bg-admin-muted/80"
                              : "cursor-not-allowed border-transparent bg-transparent opacity-50"
                          }`}
                        >
                          <span className="text-[11px] text-admin-text-secondary">{stat.label}</span>
                          <span className="flex w-full items-center justify-between gap-1">
                            <span
                              className={`text-xl font-semibold tabular-nums ${stat.countClass}`}
                            >
                              {stat.count}
                            </span>
                            {clickable ? (
                              <ChevronRight
                                size={16}
                                strokeWidth={2}
                                className="shrink-0 text-admin-text-secondary"
                                aria-hidden
                              />
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="sm:border-l sm:border-admin-border/70 sm:pl-6">
                  {context.discount_cards.length ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-admin-text-secondary">Карта</span>
                      {context.discount_cards.map((c) => (
                        <span
                          key={c.number}
                          className="inline-flex items-center gap-1 rounded-md bg-admin-surface px-2 py-1 font-mono text-xs text-admin-text shadow-sm ring-1 ring-admin-border/80"
                        >
                          {c.number}
                          <span className="font-sans text-[11px] font-semibold text-admin-primary">−{c.discount_percent}%</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-admin-text-secondary">Скидочная карта не привязана</span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm leading-snug text-admin-text-secondary">
                Введите номер — появятся заказы и скидочная карта клиента.
              </p>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <h2 className="text-sm font-semibold text-admin-text">Товары *</h2>
        {itemsLocked ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Заказ в статусе «Выполнен» или «Отменён» — состав строк и цены нельзя менять. Можно править контакты, доставку
            и комментарий.
          </p>
        ) : null}
        <div className="space-y-2">
          {lines.some(isCompleteOrderLine) ? (
            <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-admin-border/60">
              <div className="min-w-[28rem]">
                <div
                  className={`${orderLineTableGrid} border-b border-admin-border/80 bg-admin-muted/55 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-admin-text-secondary`}
                >
                  <span>Наименование</span>
                  <span className="text-center">Кол-во</span>
                  <span className="text-right">Цена</span>
                  <span className="text-right">Итого</span>
                  <span className="sr-only">Действия</span>
                </div>
                <div className="divide-y divide-admin-border/70">
                  {lines.map((line, idx) => {
                    if (!isCompleteOrderLine(line)) return null;
                    return (
                      <div key={`line-${idx}`} className={`${orderLineTableGrid} bg-admin-muted/25 px-3 py-2`}>
                        <p className="min-w-0 truncate text-sm leading-snug text-admin-text">
                          <span className="font-medium">{line.product_id} - {line.brand_name}  {line.product_name}</span>
                          {line.variant_title ? (
                            <span className="font-normal text-admin-text-secondary"> - {line.variant_title}</span>
                          ) : null}
                        </p>
                        <div className="justify-self-center">
                          {itemsLocked ? (
                            <span className="inline-flex h-8 w-11 items-center justify-center rounded-lg bg-admin-surface text-sm font-medium tabular-nums ring-1 ring-inset ring-admin-border/70">
                              {line.qty}
                            </span>
                          ) : (
                            <input
                              type="number"
                              min={1}
                              aria-label={`Количество: ${line.product_name}`}
                              className="h-8 w-11 rounded-lg bg-admin-surface text-center text-sm font-medium tabular-nums ring-1 ring-inset ring-admin-border/70 outline-none transition focus:ring-2 focus:ring-admin-primary/25"
                              value={line.qty}
                              onChange={(e) => setLineQty(idx, Number(e.target.value))}
                            />
                          )}
                        </div>
                        <p className="text-right text-sm tabular-nums text-admin-text">{formatMoneyRub(line.price)}</p>
                        <p className="text-right text-sm font-semibold tabular-nums text-admin-text">
                          {formatMoneyRub(orderLineMerchandiseTotal(line))}
                        </p>
                        <div className="justify-self-end">
                          {!itemsLocked ? (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-admin-text-secondary transition hover:bg-red-50 hover:text-red-600"
                              aria-label={`Удалить ${line.product_name}`}
                              title="Удалить"
                            >
                              <Trash2 size={16} strokeWidth={1.75} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
          {lines.map((line, idx) => {
            if (isCompleteOrderLine(line)) return null;
            const detail = line.product_id ? detailsByProductId[line.product_id] : undefined;
            const inStock = variantsInStock(detail);
            const variantChoices = orderableProductVariants(detail);
            const showPicker = activeLine === idx;
            const isPickerHost = showPicker || pickerProductId === line.product_id;
            const flatProductHits = flattenProductSmartSearchHits(productHits);
            const showProductHitList =
              showPicker &&
              loadingProductLineIdx !== idx &&
              (productHitsLoading || flatProductHits.length > 0 || debouncedProductQ.trim().length >= 2);

            return (
              <div
                key={`line-${idx}`}
                className="rounded-xl border border-dashed border-admin-border/90 bg-admin-muted/25 px-3 py-2.5"
              >
                {itemsLocked ? (
                  <div className="text-xs text-admin-text-secondary">Позиция {idx + 1} — данные строки недоступны для редактирования.</div>
                ) : (
                  <div className="space-y-2" ref={isPickerHost ? productPickerRef : undefined}>
                    <div className="text-xs font-medium text-admin-text-secondary">Позиция {idx + 1}</div>
                    <div className="relative">
                      <input
                        value={line.product_name}
                        onFocus={() => openProductPicker(idx)}
                        onChange={(e) => {
                          openProductPicker(idx);
                          const v = e.target.value;
                          setLines((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, product_name: v } : row)),
                          );
                        }}
                        className="w-full rounded-xl border border-admin-border px-3 py-2 text-sm"
                        placeholder="Название, артикул или код товара"
                      />
                      {showProductHitList ? (
                        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-admin-border bg-admin-surface shadow-lg">
                          {productHitsLoading ? (
                            <div className="px-3 py-2 text-xs text-admin-text-secondary">Поиск…</div>
                          ) : flatProductHits.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-admin-text-secondary">Ничего не найдено</div>
                          ) : (
                            flatProductHits.map((option) => {
                              const q = line.product_name.trim();
                              const hit = option.hit;
                              if (option.kind === "no-variants") {
                                return (
                                  <div
                                    key={option.key}
                                    className="border-b border-gray-50 px-3 py-2 text-left text-xs text-admin-text-secondary last:border-0"
                                  >
                                    <span className="tabular-nums text-gray-400">
                                      {highlightQueryInText(String(hit.id), q)}
                                    </span>{" "}
                                    {hit.brand_name ? (
                                      <span>{highlightQueryInText(hit.brand_name, q)} </span>
                                    ) : null}
                                    <span className="text-admin-text">{highlightQueryInText(hit.name, q)}</span>
                                    <span className="text-admin-text-secondary"> — нет вариантов</span>
                                  </div>
                                );
                              }
                              const variant = option.variant;
                              const availability = productSmartSearchAvailabilityLabel(variant);
                              return (
                                <button
                                  key={option.key}
                                  type="button"
                                  className="block w-full border-b border-gray-50 px-3 py-2 text-left text-xs last:border-0 hover:bg-admin-muted"
                                  onMouseDown={(ev) => ev.preventDefault()}
                                  onClick={() => void pickProductVariantFromSearch(idx, hit, variant)}
                                >
                                  <span className="tabular-nums text-gray-400">
                                    {highlightQueryInText(String(hit.id), q)}
                                  </span>{" "}
                                  {hit.brand_name ? (
                                    <span className="text-admin-text-secondary">
                                      {highlightQueryInText(hit.brand_name, q)}{" "}
                                    </span>
                                  ) : null}
                                  <span className="font-medium text-admin-text">
                                    {highlightQueryInText(hit.name, q)}
                                  </span>{" "}
                                  <span className="text-admin-text">
                                    {highlightQueryInText(variant.title, q)}
                                  </span>
                                  <span className="text-admin-text-secondary"> — </span>
                                  <span className={productSmartSearchAvailabilityClass(variant)}>
                                    {highlightQueryInText(availability, q)}
                                  </span>
                                  {productSmartSearchShowsPrice(variant) ? (
                                    <>
                                      <span className="text-admin-text-secondary"> — </span>
                                      <span className="tabular-nums text-admin-text">
                                        {productSmartSearchPriceLabel(variant)}
                                      </span>
                                    </>
                                  ) : null}
                                </button>
                              );
                            })
                          )}
                        </div>
                      ) : null}
                    </div>

                    {pickerProductId && line.product_id === pickerProductId && detail ? (
                      variantChoices.length === 0 ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-sm text-admin-text">
                          <div className="font-medium">У товара нет вариантов</div>
                          <p className="mt-1 text-xs text-admin-text">Такой товар в заказ добавить нельзя. Выберите другой в поле поиска выше.</p>
                          <button
                            type="button"
                            className="mt-2 text-xs font-medium text-admin-text underline decoration-gray-400 underline-offset-2 hover:text-admin-text"
                            onClick={() => openProductPicker(idx)}
                          >
                            Сменить товар
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-admin-border bg-admin-muted/60 p-2">
                          <div className="mb-1 text-xs font-medium text-admin-text-secondary">Выберите вариант</div>
                          {inStock.length === 0 ? (
                            <p className="mb-2 text-xs text-amber-900/90">
                              Сейчас ни у одного варианта нет в наличии — для ручного заказа можно выбрать любой вариант.
                            </p>
                          ) : null}
                          <div className="flex flex-wrap gap-1.5">
                            {variantChoices.map((v) => {
                              const tipLine2 = v.fulfillment_tooltip?.trim() ?? "";
                              const available = Boolean(v.is_available || v.is_preorder);
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
                                  onMouseDown={() => setVariantTooltip(null)}
                                  onClick={() => pickVariantForLine(idx, detail, v.id)}
                                  className={`rounded-lg border bg-admin-surface px-2 py-1 text-left text-xs hover:border-gray-400 ${available ? "border-admin-border" : "border-amber-200/80 bg-amber-50/40"}`}
                                >
                                  <div className="font-medium text-admin-text">{v.title || v.display_name}</div>
                                  <div className="text-admin-text-secondary">
                                    {v.price != null ? `${v.price} руб.` : "нет в наличии"}
                                    {typeof v.available_stock === "number" ? ` · ост. ${v.available_stock}` : ""}
                                    {!available ? (
                                      <span className="block text-[10px] text-amber-900/90">Нет в наличии</span>
                                    ) : null}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )
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
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-admin-border bg-admin-muted/20 px-3 py-2.5 text-sm font-medium text-admin-text-secondary transition hover:border-admin-primary/35 hover:bg-admin-muted/50 hover:text-admin-text disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={16} strokeWidth={2} />
            Добавить позицию
          </button>
        </div>
      </SectionCard>

      <SectionCard>
        <h2 className="text-sm font-semibold text-admin-text">Доставка и оплата</h2>

        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="space-y-4 rounded-xl border border-admin-border bg-admin-muted/60 p-4">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-admin-text">Способ доставки *</legend>
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
                {deliveryMethod === "minsk_courier" ? (
                  <div>
                    <label className="block text-sm text-admin-text-secondary">Населённый пункт</label>
                    <input
                      type="text"
                      readOnly
                      value={MINSK_COURIER_CITY}
                      tabIndex={-1}
                      className="mt-1 w-full cursor-not-allowed rounded-xl border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text"
                      aria-readonly="true"
                    />
                  </div>
                ) : showCitySelect ? (
                  <div className="space-y-2">
                    <label className="block text-sm text-admin-text-secondary">Населённый пункт</label>
                    <select
                      value={citySelect}
                      onChange={(e) => setCitySelect(e.target.value)}
                      className="w-full rounded-xl border border-admin-border bg-admin-surface px-3 py-2 text-sm"
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
                          className="w-full rounded-xl border border-admin-border bg-admin-surface px-3 py-2 text-sm"
                          placeholder="Город (если не из списка)"
                        />
                      ))}
                  </div>
                ) : deliveryMethod === "belarus_courier" ? (
                  <div>
                    <div className="text-sm text-admin-text-secondary">Населённый пункт</div>
                    <div className="mt-1">{belarusCitySearch}</div>
                  </div>
                ) : null}

                <label className="block text-sm text-admin-text-secondary">
                  Адрес доставки *
                  <textarea
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-xl border border-admin-border bg-admin-surface px-3 py-2 text-sm"
                    placeholder="Улица, дом, подъезд…"
                  />
                </label>
              </>
            ) : (
              <p className="text-xs text-admin-text-secondary">Самовывоз — адрес в заказе будет «нет - самовывоз».</p>
            )}
          </div>

          <div className="space-y-4 rounded-xl border border-admin-border bg-admin-muted/60 p-4">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-admin-text">Способ оплаты *</legend>
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

            <label className="block text-sm text-admin-text-secondary">
              Доставка (руб.)
              <input
                type="number"
                min={0}
                step="0.01"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-admin-border bg-admin-surface px-3 py-2 text-sm"
              />
            </label>

            <div className="space-y-3 border-t border-admin-border/80 pt-4">
              <h3 className="text-sm font-medium text-admin-text">Скидочная карта</h3>
              {itemsLocked ? (
                <div className="rounded-xl border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text">
                  {initialOrder?.discount_card_number ? (
                    <>
                      Карта{" "}
                      <span className="font-mono font-medium text-admin-text">{initialOrder.discount_card_number}</span>
                      {parseQuoteMoney(initialOrder.discount_amount) > 0.004 ? (
                        <>
                          {" "}
                          · скидка {initialOrder.discount_percent_snapshot}% (−{initialOrder.discount_amount} руб.)
                        </>
                      ) : (
                        <span className="text-admin-text-secondary"> · скидка не применялась</span>
                      )}
                    </>
                  ) : (
                    <span className="text-admin-text-secondary">Карта не применялась</span>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-xs leading-relaxed text-admin-text-secondary">
                    Карта клиента подставляется автоматически. При оплате картой скидка по накопительной карте не
                    начисляется.
                  </p>
                  {discountCardConfirmed ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm">
                      <span>
                        Применена{" "}
                        <span className="font-mono font-medium text-admin-text">{appliedDiscountCardNumber}</span>
                        {hasLoyaltyDiscount ? (
                          <span className="text-emerald-800">
                            {" "}
                            · {loyaltyPercentStr}% (−{loyaltyDiscountStr} руб.)
                          </span>
                        ) : paymentMethod === "card" ? (
                          <span className="text-admin-text-secondary"> · при оплате картой скидка не действует</span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        className="rounded-lg border border-emerald-200 bg-admin-surface px-2 py-1 text-xs font-medium text-admin-text hover:bg-emerald-50"
                        onClick={() => {
                          setDiscountCardInput("");
                          setAppliedDiscountCardNumber("");
                          setDiscountCardError("");
                          setDiscountCardManuallyCleared(true);
                        }}
                      >
                        Убрать
                      </button>
                    </div>
                  ) : <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={discountCardInput}
                      onChange={(e) => {
                        setDiscountCardInput(e.target.value);
                        setDiscountCardError("");
                        if (appliedDiscountCardNumber && e.target.value.trim() !== appliedDiscountCardNumber) {
                          setAppliedDiscountCardNumber("");
                        }
                      }}
                      placeholder="Номер скидочной карты"
                      className="min-w-0 flex-1 rounded-xl border border-admin-border bg-admin-surface px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      disabled={!discountCardInput.trim() || orderQuoteLoading}
                      onClick={() => void applyDiscountCardToOrder(discountCardInput)}
                      className="shrink-0 rounded-xl border border-admin-border bg-admin-surface px-4 py-2 text-sm font-medium disabled:opacity-40"
                    >
                      {orderQuoteLoading ? "Проверка…" : "Применить"}
                    </button>
                  </div>
                  }
                  {context?.discount_cards.length ? (
                    <div className="flex flex-wrap gap-2">
                      {context.discount_cards.map((card) => (
                        <button
                          key={card.number}
                          type="button"
                          className="rounded-full border border-admin-border bg-admin-surface px-3 py-1 text-xs font-medium text-admin-text hover:bg-admin-muted"
                          onClick={() => {
                            setDiscountCardManuallyCleared(false);
                            void applyDiscountCardToOrder(card.number);
                          }}
                        >
                          {card.number} ({card.discount_percent}%)
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {discountCardError ? <p className="text-xs text-red-600">{discountCardError}</p> : null}
                  {orderQuoteLoading ? <p className="text-xs text-admin-text-secondary">Пересчёт скидки…</p> : null}
                </>
              )}
            </div>
          </div>
        </div>

        <label className="block border-t border-admin-border pt-4 text-sm text-admin-text-secondary">
          Комментарий
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-xl border border-admin-border px-3 py-2 text-sm"
          />
        </label>
      </SectionCard>

      {isEdit && initialOrder?.gift_certificate_purchases ? (
        <CertificatesPanel
          title="Купленные подарочные сертификаты"
          wrapperClassName="space-y-2 rounded-2xl border border-violet-100 bg-violet-50/40 p-4"
          items={initialOrder.gift_certificate_purchases}
          renderItem={(row) => (
            <li key={row.id} className="rounded-xl border border-violet-100 bg-admin-surface px-3 py-2">
              <div className="font-medium text-admin-text">{row.template_title}</div>
              <div className="mt-0.5 text-xs text-admin-text-secondary">
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
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-admin-surface px-3 py-2"
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
          )}
        />
      ) : null}

      <div className="space-y-1 rounded-xl bg-admin-muted px-4 py-3 text-sm text-admin-text">
        <div>Сумма товаров: {subtotalStr} руб.</div>
        {hasLoyaltyDiscount ? (
          <div>
            Скидка по карте{appliedDiscountCardNumber ? ` ${appliedDiscountCardNumber}` : ""}: −{loyaltyDiscountStr}{" "}
            руб.
          </div>
        ) : null}
        <div>Товары со скидкой: {merchandiseTotalStr} руб.</div>
        <div>Доставка: {Math.max(0, Number(deliveryFee) || 0).toFixed(2)} руб.</div>
        <div className="font-semibold text-admin-text">Итого: {orderTotalStr} руб.</div>
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

      {context && ordersHistoryModal && typeof document !== "undefined"
        ? createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 p-4"
            onClick={() => setOrdersHistoryModal(null)}
          >
            <div
              className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-admin-border bg-admin-surface shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h3 className="text-sm font-semibold text-admin-text">
                  {ORDERS_HISTORY_MODAL_TITLES[ordersHistoryModal]}
                </h3>
                <button
                  type="button"
                  onClick={() => setOrdersHistoryModal(null)}
                  className="rounded-lg border border-admin-border px-2.5 py-1.5 text-xs text-admin-text hover:bg-admin-muted"
                >
                  Закрыть
                </button>
              </div>
              <div className="max-h-[72vh] overflow-auto p-4">
                {ordersForHistoryModal(context, ordersHistoryModal).length === 0 ? (
                  <p className="text-sm text-admin-text-secondary">Заказы не найдены.</p>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-admin-text-secondary">
                        <th className="px-3 py-2">№ заказа</th>
                        <th className="px-3 py-2">Дата</th>
                        <th className="px-3 py-2">Что заказано</th>
                        <th className="px-3 py-2 text-right">Кол-во</th>
                        <th className="px-3 py-2 text-right">Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersForHistoryModal(context, ordersHistoryModal).map((order) => (
                        <tr key={order.id} className="border-b last:border-b-0">
                          <td className="px-3 py-2 font-medium text-admin-text">
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
                                <span className="text-xs text-admin-text-secondary">—</span>
                              ) : (
                                (order.items ?? []).map((item, idx) => (
                                  <div key={`${order.id}-item-${idx}`} className="text-xs text-admin-text">
                                    <span className="font-medium text-admin-text">{item.product_name || "Товар"}</span>
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
        <button type="submit" disabled={saving} className="rounded-full bg-admin-primary px-5 py-2.5 text-sm text-white disabled:opacity-50">
          {saving ? (isEdit ? "Сохранение…" : "Создание…") : isEdit ? "Сохранить изменения" : "Создать заказ"}
        </button>
        <button type="button" onClick={() => router.push("/admin/orders")} className="rounded-xl border px-4 py-2 text-sm">
          Отмена
        </button>
      </div>
    </form>
  );
}

"use client";

import type { ChangeEvent, ReactNode, TextareaHTMLAttributes } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createOrder,
  deleteOrder,
  fetchAdminOrderCustomerContext,
  fetchAdminOrderQuote,
  updateOrder,
  type AdminOrderCustomerContext,
  type AdminOrderPayload,
  type AdminOrderQuote,
} from "@/lib/admin-orders-api";
import AdminConfirmDialog from "@/components/admin/ui/admin-confirm-dialog";
import AdminModalShell from "@/components/admin/ui/admin-modal-shell";
import { giftCertificateStatusLabel } from "@/lib/admin-loyalty-api";
import { normalizeGiftCertificateCodeInput } from "@/lib/cart-api";
import type { OrderData, OrderItemFulfillmentOption } from "@/types/orders";
import {
  fetchStockBalanceVariantSuppliers,
  type StockBalanceVariantSupplierRow,
} from "@/lib/admin-warehouse-api";
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
import { fetchAdminClients, type AdminClient } from "@/lib/admin-clients-api";
import useDebouncedValue from "@/hooks/use-debounced-value";
import { clampBelarusNationalDigits } from "@/lib/belarus-phone-national";
import {
  ADMIN_PHONE_MAX_DIGITS,
  isAdminPhoneContextReady,
  isAdminPhoneSearchReady,
} from "@/lib/admin-phone-search";
import { isPlainByPhoneComplete } from "@/components/ui/phone-input";
import { applyWaitingDiscount, WAITING_DISCOUNT_PERCENT } from "@/lib/loyalty-pricing";
import { fetchCheckoutCityById, searchCheckoutCities, type CheckoutCityHit } from "@/lib/checkout-api";
import { getOrderStatusColor, getOrderStatusLabel } from "@/constants/order-statuses";
import { useOrderStatusOptions } from "@/hooks/use-order-status-options";
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";
import { formatMoneyRub } from "@/lib/format-money-display";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import type { AdminOrderCustomerContextOrderRow } from "@/lib/admin-orders-api";
import AdminDeliveryTimeInput, {
  formatDeliveryClockTime,
  snapDeliveryClockToTenMinutes,
} from "@/components/admin/orders/admin-delivery-time-input";
import AdminDatePicker from "@/components/admin/orders/admin-date-picker";
import AdminOrderTagsPicker from "@/components/admin/orders/admin-order-tags-picker";
import type { OrderTag } from "@/lib/admin-order-tags-api";
import { format } from "date-fns";
import StreetPrefixSelect from "@/components/ui/street-prefix-select";
import {
  DEFAULT_VETER_STREET_PREFIX,
} from "@/constants/veter-street-prefixes";

const DELIVERY_OPTIONS = [
  { value: "minsk_courier", label: "Минск" },
  { value: "belarus_courier", label: "Курьер по РБ" },
  { value: "pickup", label: "Самовывоз" },
] as const;

/** Для «Курьер по Минску» населённый пункт в заказе всегда фиксирован. */
const MINSK_COURIER_CITY = "Минск";

const DELIVERY_DAY_LABELS: {
  key: keyof CheckoutCityHit["delivery_days"];
  short: string;
  /** JS Date.getDay(): 0=Sun … 6=Sat */
  jsDay: number;
}[] = [
  { key: "monday", short: "Пн", jsDay: 1 },
  { key: "tuesday", short: "Вт", jsDay: 2 },
  { key: "wednesday", short: "Ср", jsDay: 3 },
  { key: "thursday", short: "Чт", jsDay: 4 },
  { key: "friday", short: "Пт", jsDay: 5 },
  { key: "saturday", short: "Сб", jsDay: 6 },
  { key: "sunday", short: "Вс", jsDay: 0 },
];

/** Ближайшая дата weekday начиная с сегодня (Минск) или завтра (остальные). */
function nextDateForWeekday(jsDay: number, allowToday: boolean): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  if (!allowToday) {
    d.setDate(d.getDate() + 1);
  }
  for (let i = 0; i < 7; i++) {
    if (d.getDay() === jsDay) {
      return format(d, "yyyy-MM-dd");
    }
    d.setDate(d.getDate() + 1);
  }
  return format(d, "yyyy-MM-dd");
}

function weekdayKeyFromIsoDate(
  iso: string,
): keyof CheckoutCityHit["delivery_days"] | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const hit = DELIVERY_DAY_LABELS.find((x) => x.jsDay === d.getDay());
  return hit?.key ?? null;
}

function formatIsoDateShortRu(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, "d.MM.yyyy");
}

function DeliveryDaysBadges({
  days,
  selectedDate,
  allowToday = false,
  interactive = false,
  onSelectDate,
}: {
  days: CheckoutCityHit["delivery_days"] | null | undefined;
  selectedDate?: string | null;
  allowToday?: boolean;
  interactive?: boolean;
  onSelectDate?: (isoDate: string) => void;
}) {
  if (!days) return null;
  const selectedKey = selectedDate ? weekdayKeyFromIsoDate(selectedDate) : null;
  return (
    <div className="flex flex-wrap gap-0.5">
      {DELIVERY_DAY_LABELS.map(({ key, short, jsDay }) => {
        const on = days[key] === 1;
        const selected = on && selectedKey === key;
        const className = `inline-flex h-5 min-w-[1.4rem] items-center justify-center rounded px-1 text-[10px] font-medium ${
          selected
            ? "bg-emerald-600 text-white"
            : on
              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
              : "bg-admin-muted text-admin-text-secondary/50"
        }`;
        const title = on
          ? selected
            ? `${short}: выбрано ${selectedDate ? formatIsoDateShortRu(selectedDate) : ""}`
            : `${short}: доставка`
          : `${short}: нет`;
        if (interactive && on) {
          return (
            <button
              key={key}
              type="button"
              className={`${className} cursor-pointer transition hover:bg-emerald-600 hover:text-white`}
              title={title}
              onClick={() => onSelectDate?.(nextDateForWeekday(jsDay, allowToday))}
            >
              {short}
            </button>
          );
        }
        return (
          <span key={key} className={className} title={title}>
            {short}
          </span>
        );
      })}
    </div>
  );
}

const PAYMENT_OPTIONS = [
  { value: "cash", label: "Наличными" },
  { value: "card", label: "Картой (Visa и MasterCard)" },
] as const;

const clientFieldClass =
  "w-full rounded-lg border border-admin-border bg-admin-bg px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-secondary/70 outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/20";

/** Поля доставки/оплаты: цвет значения ≠ цвет placeholder (label часто secondary). */
const surfaceFieldClass =
  "w-full rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-secondary/70 outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15";

const surfaceFieldCompactClass =
  "w-full rounded-lg border border-admin-border bg-admin-surface px-1.5 py-2 text-sm text-admin-text placeholder:text-admin-text-secondary/70 outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/15";

const orderLineTableRow =
  "flex min-w-[52rem] items-start gap-x-3";
const orderLineColName = "min-w-0 flex-1 overflow-hidden";
const orderLineColFrom = "w-[6.25rem] shrink-0";
const orderLineColQty = "w-11 shrink-0";
const orderLineColPrice = "w-[5.75rem] shrink-0";
const orderLineColTotal = "w-[6.5rem] shrink-0";
const orderLineColActions = "w-8 shrink-0";

type DeliveryValue = (typeof DELIVERY_OPTIONS)[number]["value"];
type PaymentValue = (typeof PAYMENT_OPTIONS)[number]["value"];

type FulfillmentChannel = "main" | "offer";

type MainLotChoice = {
  lot_id: number;
  label: string;
  qty: number;
  comment?: string | null;
  purchase_price?: string | null;
};

function normalizeLotPrice(value: string | null | undefined): number {
  if (value == null) return Number.POSITIVE_INFINITY;
  const normalized = String(value).trim().replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

/** Закупочная цена в дропдауне «Откуда»: округление до десятых (45.38 → 45.4). */
function formatPurchasePriceTenths(value: string | number | null | undefined): string | null {
  if (value == null || value === "") {
    return null;
  }
  const normalized = String(value).trim().replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) {
    return String(value);
  }
  return (Math.round(n * 10) / 10).toFixed(1);
}

function compareMainLotChoice(a: MainLotChoice, b: MainLotChoice): number {
  const byPrice = normalizeLotPrice(a.purchase_price) - normalizeLotPrice(b.purchase_price);
  if (byPrice !== 0) {
    return byPrice;
  }
  const aNoComment = (a.comment ?? "").trim() === "";
  const bNoComment = (b.comment ?? "").trim() === "";
  if (aNoComment !== bNoComment) {
    return aNoComment ? -1 : 1;
  }
  return a.lot_id - b.lot_id;
}

function pickPreferredLotId(choices: MainLotChoice[]): number | null {
  if (choices.length === 0) return null;
  const sorted = [...choices].sort(compareMainLotChoice);
  return sorted[0]?.lot_id ?? null;
}

type OfferChoice = {
  offer_id: number;
  label: string;
};

function offerChoicesFromFulfillment(options: OrderItemFulfillmentOption[]): OfferChoice[] {
  return options
    .filter((o) => o.channel === "offer" && typeof o.offer_id === "number" && o.offer_id > 0)
    .map((o) => {
      const detail = [
        o.code,
        o.title,
        formatPurchasePriceTenths(o.purchase_price),
        o.qty !== 0 ? `${o.qty} шт.` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        offer_id: o.offer_id!,
        label: detail ? `${o.label} · ${detail}` : o.label,
      };
    });
}

function pickPreferredOfferId(
  choices: OfferChoice[],
  preferred?: number | null,
): number | null {
  if (preferred != null && preferred > 0 && choices.some((c) => c.offer_id === preferred)) {
    return preferred;
  }
  return choices[0]?.offer_id ?? null;
}

type OrderLine = {
  product_id: number | null;
  variant_id: number | null;
  product_name: string;
  product_slug: string | null;
  brand_name: string | null;
  variant_title: string;
  sku: string | null;
  qty: number;
  /** Текущая цена строки (с учётом скидки за ожидание, если офер). */
  price: number;
  /** Цена до скидки за ожидание (для отображения было/стало). */
  base_price: number;
  availability_source: string | null;
  waiting_discount: boolean;
  can_fulfill_main: boolean;
  can_fulfill_offer: boolean;
  /** Причина подсветки: нет склада/офера или исходный канал недоступен. */
  availability_issue: string | null;
  fulfillment_options: OrderItemFulfillmentOption[];
  main_lot_choices: MainLotChoice[];
  selected_lot_id: number | null;
  offer_choices: OfferChoice[];
  selected_offer_id: number | null;
};

function mainLotChoicesFromFulfillment(options: OrderItemFulfillmentOption[]): MainLotChoice[] {
  return options
    .filter((o) => o.channel === "main" && typeof o.lot_id === "number" && o.lot_id > 0)
    .map((o) => {
      const detail = [
        o.code,
        o.title,
        formatPurchasePriceTenths(o.purchase_price),
        o.comment?.trim() || null,
        o.qty !== 0 ? `${o.qty} шт.` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        lot_id: o.lot_id!,
        label: detail ? `${o.label} · ${detail}` : o.label,
        qty: o.qty,
        comment: o.comment ?? null,
        purchase_price: o.purchase_price,
      };
    })
    .sort(compareMainLotChoice);
}

function lotChoiceLabelFromSupplierRow(row: StockBalanceVariantSupplierRow): string {
  const parts = [
    row.supplier_name,
    row.supplier_sku,
    formatPurchasePriceTenths(row.supplier_price),
    row.comment?.trim() || null,
    row.available != null ? `дост. ${row.available}` : null,
  ].filter(Boolean);
  return parts.join(" · ") || `Партия #${row.lot_id}`;
}

async function resolveMainLotChoices(
  variantId: number,
  fulfillmentOptions: OrderItemFulfillmentOption[],
): Promise<{ choices: MainLotChoice[]; selected_lot_id: number | null }> {
  const fromOptions = mainLotChoicesFromFulfillment(fulfillmentOptions);
  if (fromOptions.length > 0) {
    return {
      choices: fromOptions,
      selected_lot_id: pickPreferredLotId(fromOptions),
    };
  }

  const response = await fetchStockBalanceVariantSuppliers({ variant_id: variantId });
  const choices = (response.data ?? [])
    .filter((row) => row.source === "lot" && typeof row.lot_id === "number" && row.lot_id > 0)
    .map((row) => ({
      lot_id: row.lot_id!,
      label: lotChoiceLabelFromSupplierRow(row),
      qty: Math.max(0, Number(row.available ?? row.qty ?? 0)),
      comment: row.comment ?? null,
      purchase_price: row.supplier_price != null ? String(row.supplier_price) : null,
    }))
    .sort(compareMainLotChoice);

  return {
    choices,
    selected_lot_id: pickPreferredLotId(choices),
  };
}

function digitsOnly(s: string): string {
  return s.replace(/\D+/g, "");
}

function AutoGrowTextarea({
  value,
  onChange,
  className,
  minRows = 2,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "rows"> & {
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      {...rest}
      ref={ref}
      value={value}
      rows={minRows}
      onChange={onChange}
      className={`resize-none overflow-hidden ${className ?? ""}`}
    />
  );
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

/** BY mobile / короткие 375… — маска +375; иначе свободный ввод. */
function shouldUsePlainPhoneUi(phone: string): boolean {
  const d = digitsOnly(phone);
  if (!d) return false;
  if (d.startsWith(PHONE_PREFIX) && d.length <= 12) return false;
  return true;
}

function phoneDigitsFromStored(phone: string): string {
  return digitsOnly(phone).slice(0, ADMIN_PHONE_MAX_DIGITS);
}

function nationalFromPhoneDigits(phoneDigits: string): string {
  const d = digitsOnly(phoneDigits);
  if (d.startsWith(PHONE_PREFIX)) return d.slice(PHONE_PREFIX.length).slice(0, 9);
  return d.slice(0, 9);
}

function isValidAdminOrderPhone(phoneDigits: string, plainMode: boolean): boolean {
  const d = digitsOnly(phoneDigits);
  if (plainMode) return isPlainByPhoneComplete(d);
  return isValidBelarusMobileNational(nationalFromPhoneDigits(d));
}

type CustomerNameParts = {
  first: string;
  last: string;
  patronymic: string;
};

function looksLikePatronymic(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  return /(ович|евич|ич|овна|евна|ична|инична)$/u.test(v);
}

function looksLikeFirstName(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v || /\s/.test(v)) return false;
  const last = v.slice(-1);
  return "аяйнрлмствдкгбпь".includes(last);
}

function parseCustomerNameParts(full: string): CustomerNameParts {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "", patronymic: "" };
  if (parts.length === 1) return { first: parts[0], last: "", patronymic: "" };
  if (parts.length === 2) {
    if (looksLikeFirstName(parts[1]) && !looksLikeFirstName(parts[0])) {
      return { first: parts[1], last: parts[0], patronymic: "" };
    }
    return { first: parts[0], last: parts[1], patronymic: "" };
  }
  const a = parts[0];
  const b = parts[1];
  const c = parts.slice(2).join(" ");
  if (looksLikePatronymic(b) && !looksLikePatronymic(c)) {
    return { first: a, last: c, patronymic: b };
  }
  if (looksLikePatronymic(c) && !looksLikePatronymic(b) && looksLikeFirstName(b)) {
    return { first: b, last: a, patronymic: c };
  }
  return { first: a, last: b, patronymic: c };
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
    base_price: 0,
    availability_source: null,
    waiting_discount: false,
    can_fulfill_main: false,
    can_fulfill_offer: false,
    availability_issue: null,
    fulfillment_options: [],
    main_lot_choices: [],
    selected_lot_id: null,
    offer_choices: [],
    selected_offer_id: null,
  };
}

function orderLineMerchandiseTotal(line: OrderLine): number {
  return Math.max(0, line.qty) * Math.max(0, line.price);
}

function isCompleteOrderLine(l: OrderLine): boolean {
  return Boolean(l.product_id && l.variant_id && l.product_name.trim());
}

function availabilityIssueForLine(
  channel: FulfillmentChannel | null,
  canMainLive: boolean,
  canOfferLive: boolean,
): string | null {
  if (!canMainLive && !canOfferLive) {
    return "Нет склада и офера";
  }
  if (channel === "main" && !canMainLive) {
    return canOfferLive ? "Нет склада — канал недоступен" : "Нет склада";
  }
  if (channel === "offer" && !canOfferLive) {
    return canMainLive ? "Нет офера — канал недоступен" : "Нет офера";
  }
  return null;
}

/** Строка «Позиция N», в которую ничего не ввели — не валидируем и не отправляем. */
function isBlankOrderLine(l: OrderLine): boolean {
  return !l.product_id && !l.variant_id && !l.product_name.trim();
}

function channelFromSource(source: string | null | undefined): FulfillmentChannel | null {
  if (!source || source === "unavailable") return null;
  if (source === "main" || source === "main+supplier") return "main";
  return "offer";
}

function sourceFromChannel(
  channel: FulfillmentChannel,
  prevSource: string | null | undefined,
  canMain: boolean,
  canOffer: boolean,
): string {
  if (channel === "main") {
    if (!canMain) return prevSource && prevSource !== "unavailable" ? prevSource : "unavailable";
    if (prevSource === "main+supplier" && canOffer) return "main+supplier";
    return "main";
  }
  if (!canOffer) return prevSource && prevSource !== "unavailable" ? prevSource : "unavailable";
  return "supplier_only";
}

function defaultFulfillment(canMain: boolean, canOffer: boolean): Pick<
  OrderLine,
  "availability_source" | "can_fulfill_main" | "can_fulfill_offer" | "waiting_discount"
> {
  if (canMain) {
    return {
      availability_source: canOffer ? "main+supplier" : "main",
      can_fulfill_main: true,
      can_fulfill_offer: canOffer,
      waiting_discount: false,
    };
  }
  if (canOffer) {
    return {
      availability_source: "supplier_only",
      can_fulfill_main: false,
      can_fulfill_offer: true,
      waiting_discount: true,
    };
  }
  return {
    availability_source: "unavailable",
    can_fulfill_main: false,
    can_fulfill_offer: false,
    waiting_discount: false,
  };
}

/** Восстановить базовую цену из цены со скидкой 3% за ожидание. */
function estimateBaseFromWaitingPrice(waitingPrice: number): number {
  if (waitingPrice <= 0) return 0;
  return Math.round((waitingPrice / (1 - WAITING_DISCOUNT_PERCENT / 100)) * 10) / 10;
}

function priceWithOptionalWaiting(basePrice: number, waiting: boolean): number {
  if (!waiting || basePrice <= 0) return Math.max(0, basePrice);
  const next = applyWaitingDiscount(String(basePrice));
  return next != null ? Number(next) : basePrice;
}

function linesFromOrderItems(
  order: OrderData,
  opts?: { strictLive?: boolean },
): OrderLine[] {
  if (!order.items?.length) return [emptyLine()];
  const strictLive = Boolean(opts?.strictLive);
  return order.items.map((item) => {
    const source = item.availability_source ?? null;
    const channel = channelFromSource(source);
    const liveMain = Boolean(item.can_fulfill_main_live ?? item.can_fulfill_main);
    const liveOffer = Boolean(item.can_fulfill_offer_live ?? item.can_fulfill_offer);
    const canMain = strictLive
      ? liveMain
      : Boolean(item.can_fulfill_main) || channel === "main";
    const canOffer = strictLive
      ? liveOffer
      : Boolean(item.can_fulfill_offer) || channel === "offer";
    const waiting = Boolean(item.waiting_discount) || channel === "offer";
    const price = Number(item.price) || 0;
    const basePrice = waiting && price > 0 ? estimateBaseFromWaitingPrice(price) : price;
    const fulfillmentOptions = item.fulfillment_options ?? [];
    const mainChoices = mainLotChoicesFromFulfillment(fulfillmentOptions);
    const offerChoices = offerChoicesFromFulfillment(fulfillmentOptions);
    const allocationLotId = item.stock_lot_allocations?.[0]?.lot_id ?? null;
    const storedOfferId = item.supplier_variant_offer_id ?? null;
    return {
      product_id: item.product_id ?? null,
      variant_id: item.variant_id ?? null,
      product_name: item.product_name ?? "",
      product_slug: item.product_slug ?? null,
      brand_name: item.brand_name ?? null,
      variant_title: item.variant_title ?? "",
      sku: item.sku ?? null,
      qty: Math.max(1, Number(item.qty) || 1),
      price,
      base_price: basePrice,
      availability_source: source,
      waiting_discount: waiting,
      can_fulfill_main: canMain,
      can_fulfill_offer: canOffer,
      availability_issue: strictLive
        ? availabilityIssueForLine(channel, liveMain, liveOffer)
        : null,
      fulfillment_options: fulfillmentOptions,
      main_lot_choices: mainChoices,
      selected_lot_id: allocationLotId ?? pickPreferredLotId(mainChoices),
      offer_choices: offerChoices,
      selected_offer_id: pickPreferredOfferId(offerChoices, storedOfferId),
    };
  });
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

/** Подсветка вхождений запроса (по словам; без regex по юникоду). */
function highlightQueryInText(text: string, query: string): ReactNode {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return text;

  const lowerText = text.toLocaleLowerCase("ru-RU");
  type Range = { start: number; end: number };
  const ranges: Range[] = [];

  for (const token of tokens) {
    const lowerToken = token.toLocaleLowerCase("ru-RU");
    let pos = 0;
    for (let n = 0; n < 80 && pos < text.length; n += 1) {
      const idx = lowerText.indexOf(lowerToken, pos);
      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + token.length });
      pos = idx + Math.max(1, token.length);
    }
  }

  if (ranges.length === 0) return text;

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Range[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      continue;
    }
    merged.push({ ...range });
  }

  const parts: ReactNode[] = [];
  let pos = 0;
  merged.forEach((range, i) => {
    if (range.start > pos) parts.push(text.slice(pos, range.start));
    parts.push(
      <mark key={`h-${range.start}-${i}`} className="rounded-sm bg-amber-200 px-0.5 text-admin-text">
        {text.slice(range.start, range.end)}
      </mark>,
    );
    pos = range.end;
  });
  if (pos < text.length) parts.push(text.slice(pos));
  return <>{parts}</>;
}

function formatOrderLineProductLabel(line: {
  product_id: number | null;
  brand_name: string | null;
  product_name: string;
}): string {
  const title = [line.brand_name?.trim(), line.product_name.trim()].filter(Boolean).join(" ");
  if (line.product_id) {
    return title ? `${line.product_id} - ${title}` : String(line.product_id);
  }
  return title;
}

export type AdminOrderCreateFormProps = {
  mode?: "create" | "edit";
  initialOrder?: OrderData;
  /** Исходный заказ для копии (create + предзаполнение, новый ID после сохранения). */
  copyFromOrder?: OrderData;
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
  className?: string;
};

function SectionCard({ children, className = "" }: SectionCardProps) {
  return (
    <section
      className={`space-y-4 rounded-2xl border border-admin-border bg-admin-surface p-5 shadow-admin-card ${className}`.trim()}
    >
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
  copyFromOrder,
  initialPhone,
  initialCustomerName,
}: AdminOrderCreateFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit" && initialOrder != null;
  const isCopy = mode === "create" && copyFromOrder != null;
  const seedOrder = isEdit ? initialOrder : copyFromOrder ?? undefined;
  const initialOrderId = initialOrder?.id ?? null;
  const itemsLocked = Boolean(
    isEdit && initialOrder && ["done", "completed"].includes(String(initialOrder.status)),
  );
  const useStrictLiveAvailability =
    isCopy || Boolean(isEdit && initialOrder && initialOrder.status === "cancelled");

  /** Полный номер цифрами (375… или международный). */
  const [phoneDigits, setPhoneDigits] = useState(() =>
    phoneDigitsFromStored(seedOrder?.phone ?? initialPhone ?? ""),
  );
  const [plainPhoneMode, setPlainPhoneMode] = useState(() =>
    shouldUsePlainPhoneUi(seedOrder?.phone ?? initialPhone ?? ""),
  );
  const [customerFirstName, setCustomerFirstName] = useState(
    () =>
      parseCustomerNameParts(
        seedOrder?.customer_name?.trim() || initialCustomerName?.trim() || "",
      ).first,
  );
  const [customerLastName, setCustomerLastName] = useState(
    () =>
      parseCustomerNameParts(
        seedOrder?.customer_name?.trim() || initialCustomerName?.trim() || "",
      ).last,
  );
  const [customerPatronymic, setCustomerPatronymic] = useState(
    () =>
      parseCustomerNameParts(
        seedOrder?.customer_name?.trim() || initialCustomerName?.trim() || "",
      ).patronymic,
  );
  const [comment, setComment] = useState(() => seedOrder?.comment ?? "");
  const [managerComment, setManagerComment] = useState(() => seedOrder?.manager_comment ?? "");
  const [orderStatus, setOrderStatus] = useState(() => (isCopy ? "new" : seedOrder?.status ?? "new"));
  const { options: statusOptions } = useOrderStatusOptions(true);
  const statusDropdownOptions = useMemo(() => {
    if (statusOptions.some((item) => item.value === orderStatus)) {
      return statusOptions;
    }
    return [
      ...statusOptions,
      {
        value: orderStatus,
        label: getOrderStatusLabel(orderStatus, seedOrder?.status_label),
        color: getOrderStatusColor(orderStatus, seedOrder?.status_color),
      },
    ];
  }, [statusOptions, orderStatus, seedOrder?.status_label, seedOrder?.status_color]);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryValue>(() => normalizeDelivery(seedOrder?.delivery_method));
  const [deliveryCity, setDeliveryCity] = useState(() => {
    const method = normalizeDelivery(seedOrder?.delivery_method);
    if (method === "minsk_courier") return MINSK_COURIER_CITY;
    if (method === "belarus_courier") {
      const id = seedOrder?.delivery_city_id;
      if (typeof id === "number" && id > 0) {
        return seedOrder?.delivery_city ?? "";
      }
      return "";
    }
    return seedOrder?.delivery_city ?? "";
  });
  const [deliveryCityId, setDeliveryCityId] = useState<number | null>(() => {
    const method = normalizeDelivery(seedOrder?.delivery_method);
    if (method !== "belarus_courier") return null;
    const id = seedOrder?.delivery_city_id;
    return typeof id === "number" && id > 0 ? id : null;
  });
  const [belarusDeliveryDays, setBelarusDeliveryDays] = useState<CheckoutCityHit["delivery_days"] | null>(null);
  const [citySelect, setCitySelect] = useState<string>("");
  const [deliveryAddress, setDeliveryAddress] = useState(() => seedOrder?.delivery_address ?? "");
  const [deliveryStreetPrefix, setDeliveryStreetPrefix] = useState(
    () => seedOrder?.delivery_street_prefix?.trim() || DEFAULT_VETER_STREET_PREFIX,
  );
  const [deliveryHouse, setDeliveryHouse] = useState(() => seedOrder?.delivery_house ?? "");
  const [deliveryKorpus, setDeliveryKorpus] = useState(() => seedOrder?.delivery_korpus ?? "");
  const [deliveryApartment, setDeliveryApartment] = useState(
    () => seedOrder?.delivery_apartment ?? "",
  );
  const [deliveryComment, setDeliveryComment] = useState(
    () => seedOrder?.delivery_comment ?? "",
  );
  const [shipmentId, setShipmentId] = useState(() => (isCopy ? "" : seedOrder?.shipment_id ?? ""));
  const [deliveryTimeFrom, setDeliveryTimeFrom] = useState(
    () => snapDeliveryClockToTenMinutes(seedOrder?.delivery_time_from),
  );
  const [deliveryTimeTo, setDeliveryTimeTo] = useState(
    () => snapDeliveryClockToTenMinutes(seedOrder?.delivery_time_to),
  );
  const [shipmentDate, setShipmentDate] = useState(
    () =>
      seedOrder?.shipment_date?.trim() ||
      format(new Date(), "yyyy-MM-dd"),
  );
  const [courierDeliveryDate, setCourierDeliveryDate] = useState(
    () => seedOrder?.delivery_date?.trim() || "",
  );
  const [selectedTags, setSelectedTags] = useState<OrderTag[]>(() =>
    (seedOrder?.tags ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
    })),
  );
  const [deliveryTimeModalOpen, setDeliveryTimeModalOpen] = useState(false);
  const [draftDeliveryTimeFrom, setDraftDeliveryTimeFrom] = useState("");
  const [belarusCityQuery, setBelarusCityQuery] = useState(() => {
    const method = normalizeDelivery(seedOrder?.delivery_method);
    if (method !== "belarus_courier") return "";
    const id = seedOrder?.delivery_city_id;
    if (typeof id === "number" && id > 0) return "";
    const city = (seedOrder?.delivery_city ?? "").trim();
    if (!city) return "";
    return city.includes(",") ? city.slice(0, city.indexOf(",")).trim() : city;
  });
  const [draftDeliveryTimeTo, setDraftDeliveryTimeTo] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentValue>(() => normalizePayment(seedOrder?.payment_method));
  const [deliveryFee, setDeliveryFee] = useState(() => Math.max(0, Number(seedOrder?.delivery_fee ?? 0) || 0));
  const [discountCardInput, setDiscountCardInput] = useState(() => seedOrder?.discount_card_number?.trim() ?? "");
  const [appliedDiscountCardNumber, setAppliedDiscountCardNumber] = useState(
    () => seedOrder?.discount_card_number?.trim() ?? "",
  );
  /** Пользователь явно убрал карту — не подставлять снова, пока не сменится телефон. */
  const [discountCardManuallyCleared, setDiscountCardManuallyCleared] = useState(false);
  const [discountCardError, setDiscountCardError] = useState("");
  const [giftCertificateInput, setGiftCertificateInput] = useState(
    () => seedOrder?.gift_certificate_code?.trim() ?? "",
  );
  const [appliedGiftCertificateCode, setAppliedGiftCertificateCode] = useState(
    () => seedOrder?.gift_certificate_code?.trim() ?? "",
  );
  const [giftCertificateError, setGiftCertificateError] = useState("");
  const [orderQuote, setOrderQuote] = useState<AdminOrderQuote | null>(null);
  const [orderQuoteLoading, setOrderQuoteLoading] = useState(false);
  const [lines, setLines] = useState<OrderLine[]>(() =>
    seedOrder
      ? linesFromOrderItems(seedOrder, { strictLive: useStrictLiveAvailability })
      : [emptyLine()],
  );
  const [saving, setSaving] = useState(false);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
  const [pendingRestoreStatus, setPendingRestoreStatus] = useState<string | null>(null);

  const syncMainLotsForLine = useCallback(
    async (lineIdx: number, variantId: number, fulfillmentOptions: OrderItemFulfillmentOption[]) => {
      try {
        const { choices, selected_lot_id } = await resolveMainLotChoices(variantId, fulfillmentOptions);
        if (choices.length === 0) {
          return;
        }
        setLines((prev) =>
          prev.map((row, i) =>
            i === lineIdx
              ? {
                  ...row,
                  main_lot_choices: choices,
                  selected_lot_id: row.selected_lot_id ?? selected_lot_id,
                  offer_choices: offerChoicesFromFulfillment(fulfillmentOptions),
                  selected_offer_id:
                    channelFromSource(row.availability_source) === "offer"
                      ? (row.selected_offer_id ??
                        pickPreferredOfferId(offerChoicesFromFulfillment(fulfillmentOptions)))
                      : row.selected_offer_id,
                }
              : row,
          ),
        );
      } catch {
        // партии опциональны до сохранения
      }
    },
    [],
  );

  useEffect(() => {
    if (!initialOrder) {
      return;
    }
    lines.forEach((line, idx) => {
      if (!line.variant_id || channelFromSource(line.availability_source) !== "main") {
        return;
      }
      if (line.main_lot_choices.length > 0) {
        return;
      }
      void syncMainLotsForLine(idx, line.variant_id, line.fulfillment_options);
    });
    // только при открытии заказа на редактирование
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrder?.id, syncMainLotsForLine]);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [error, setError] = useState("");

  /** Снимок полей РБ — чтобы при Минск/самовывоз → обратно на РБ не терять город/адрес. */
  const belarusDeliverySnapRef = useRef<{
    deliveryCity: string;
    deliveryCityId: number | null;
    belarusCityQuery: string;
    belarusDeliveryDays: CheckoutCityHit["delivery_days"] | null;
    deliveryAddress: string;
    deliveryStreetPrefix: string;
    deliveryHouse: string;
    deliveryKorpus: string;
    deliveryApartment: string;
    deliveryComment: string;
    shipmentId: string;
  } | null>(null);

  /** Сохранённый ID отправки блокирует смену на Минск / самовывоз. */
  const shipmentBlocksNonRbDelivery =
    !isCopy && (initialOrder?.shipment_id ?? "").trim() !== "";

  const [phoneHits, setPhoneHits] = useState<AdminClient[]>([]);
  const [phoneHitsOpen, setPhoneHitsOpen] = useState(false);
  const [phoneHitsLoading, setPhoneHitsLoading] = useState(false);

  const [context, setContext] = useState<AdminOrderCustomerContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [ordersHistoryModal, setOrdersHistoryModal] = useState<OrdersHistoryModalKind | null>(null);

  const debouncedPhone = useDebouncedValue(phoneDigits, 280);

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
  const productSearchInputRef = useRef<HTMLInputElement>(null);
  const productHitsListRef = useRef<HTMLDivElement>(null);
  const [productHitsPos, setProductHitsPos] = useState<{
    left: number;
    width: number;
    top: number;
    maxHeight: number;
    openUp: boolean;
  } | null>(null);
  /** Не перезаписывать имя повторно для того же телефона после ручного ввода. */
  const autoCustomerNamePhoneRef = useRef<string>("");

  const debouncedBelarusCityQuery = useDebouncedValue(belarusCityQuery, 350);
  const [belarusCityHits, setBelarusCityHits] = useState<CheckoutCityHit[]>([]);
  const [belarusCityOpen, setBelarusCityOpen] = useState(false);
  const [belarusCityLookupFailed, setBelarusCityLookupFailed] = useState(false);

  useEffect(() => {
    if (!variantTooltip) return;
    const hide = () => setVariantTooltip(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [variantTooltip]);

  useEffect(() => {
    if (deliveryMethod !== "belarus_courier" || !deliveryCityId || belarusDeliveryDays) return;
    let cancelled = false;
    void fetchCheckoutCityById(deliveryCityId)
      .then((hit) => {
        if (cancelled || !hit?.delivery_days) return;
        setBelarusDeliveryDays(hit.delivery_days);
        setCourierDeliveryDate((prev) => {
          if (!prev) return prev;
          const key = weekdayKeyFromIsoDate(prev);
          if (!key || hit.delivery_days[key] !== 1) return "";
          return prev;
        });
        if (!deliveryCity.trim() && hit.full_name?.trim()) {
          setDeliveryCity(hit.full_name.trim());
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [belarusDeliveryDays, deliveryCity, deliveryCityId, deliveryMethod]);

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

  useEffect(() => {
    if (deliveryMethod !== "belarus_courier") return;
    belarusDeliverySnapRef.current = {
      deliveryCity,
      deliveryCityId,
      belarusCityQuery,
      belarusDeliveryDays,
      deliveryAddress,
      deliveryStreetPrefix,
      deliveryHouse,
      deliveryKorpus,
      deliveryApartment,
      deliveryComment,
      shipmentId,
    };
  }, [
    deliveryMethod,
    deliveryCity,
    deliveryCityId,
    belarusCityQuery,
    belarusDeliveryDays,
    deliveryAddress,
    deliveryStreetPrefix,
    deliveryHouse,
    deliveryKorpus,
    deliveryApartment,
    deliveryComment,
    shipmentId,
  ]);

  const handleDeliveryMethodChange = useCallback(
    (value: DeliveryValue) => {
      if (
        (value === "minsk_courier" || value === "pickup") &&
        (initialOrder?.shipment_id ?? "").trim() !== ""
      ) {
        setError(
          "Нельзя переключить на «Минск» или «Самовывоз» при заполненном ID отправки. Удалите ID отправки, сохраните заказ, затем смените способ доставки.",
        );
        return;
      }

      setError("");
      setDeliveryMethod(value);

      if (value === "pickup") {
        setDeliveryFee(0);
      } else if (value === "minsk_courier") {
        const fromQuote = Number.parseFloat(String(orderQuote?.merchandise_total ?? "").replace(",", "."));
        const merchandise = Number.isFinite(fromQuote)
          ? fromQuote
          : lines
              .filter(isCompleteOrderLine)
              .reduce((a, l) => a + Math.max(0, l.qty) * Math.max(0, l.price), 0);
        setDeliveryFee(merchandise + 0.0001 >= 50 ? 0 : 3);
        setDeliveryCity(MINSK_COURIER_CITY);
        setCitySelect("");
        setBelarusCityHits([]);
        setBelarusCityOpen(false);
      } else if (value === "belarus_courier") {
        setPaymentMethod((pm) => (pm === "card" ? "cash" : pm));
        setCitySelect("");
        setBelarusCityHits([]);
        setBelarusCityOpen(false);

        const snap = belarusDeliverySnapRef.current;
        if (snap) {
          setDeliveryCity(snap.deliveryCity);
          setDeliveryCityId(snap.deliveryCityId);
          setBelarusCityQuery(snap.belarusCityQuery);
          setBelarusDeliveryDays(snap.belarusDeliveryDays);
          setDeliveryAddress(snap.deliveryAddress);
          setDeliveryStreetPrefix(snap.deliveryStreetPrefix);
          setDeliveryHouse(snap.deliveryHouse);
          setDeliveryKorpus(snap.deliveryKorpus);
          setDeliveryApartment(snap.deliveryApartment);
          setDeliveryComment(snap.deliveryComment);
          setShipmentId(snap.shipmentId);
        } else if (initialOrder && normalizeDelivery(initialOrder.delivery_method) === "belarus_courier") {
          const id = initialOrder.delivery_city_id;
          const cityId = typeof id === "number" && id > 0 ? id : null;
          setDeliveryCity(cityId != null ? (initialOrder.delivery_city ?? "") : "");
          setDeliveryCityId(cityId);
          setBelarusDeliveryDays(null);
          setBelarusCityQuery(
            cityId != null
              ? ""
              : (() => {
                  const city = (initialOrder.delivery_city ?? "").trim();
                  if (!city) return "";
                  return city.includes(",") ? city.slice(0, city.indexOf(",")).trim() : city;
                })(),
          );
          setDeliveryAddress(initialOrder.delivery_address ?? "");
          setDeliveryStreetPrefix(
            initialOrder.delivery_street_prefix?.trim() || DEFAULT_VETER_STREET_PREFIX,
          );
          setDeliveryHouse(initialOrder.delivery_house ?? "");
          setDeliveryKorpus(initialOrder.delivery_korpus ?? "");
          setDeliveryApartment(initialOrder.delivery_apartment ?? "");
          setDeliveryComment(initialOrder.delivery_comment ?? "");
          setShipmentId(initialOrder.shipment_id ?? "");
        } else {
          setDeliveryCity((prev) => (prev.trim() === MINSK_COURIER_CITY ? "" : prev));
          setDeliveryCityId(null);
          setBelarusDeliveryDays(null);
        }
      }
    },
    [initialOrder, lines, orderQuote?.merchandise_total],
  );

  useEffect(() => {
    const searchKey = plainPhoneMode
      ? digitsOnly(debouncedPhone)
      : fullPhoneFromNational(nationalFromPhoneDigits(debouncedPhone));
    const national = nationalFromPhoneDigits(searchKey);
    const ready = plainPhoneMode
      ? isAdminPhoneSearchReady(searchKey) || searchKey.length >= PHONE_CLIENT_HINT_MIN_NATIONAL
      : national.length >= PHONE_CLIENT_HINT_MIN_NATIONAL;
    if (!ready || !searchKey) {
      setPhoneHits([]);
      return;
    }
    let cancelled = false;
    setPhoneHitsLoading(true);
    void fetchAdminClients({ search: searchKey })
      .then((response) => {
        if (!cancelled) {
          const want = digitsOnly(searchKey);
          const rows = (response.data ?? []).filter((client) => {
            if (!client.phone) return false;
            const clientPhoneDigits = digitsOnly(client.phone);
            return (
              clientPhoneDigits === want ||
              clientPhoneDigits.endsWith(want) ||
              want.endsWith(clientPhoneDigits) ||
              (!plainPhoneMode && clientPhoneDigits.endsWith(national))
            );
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
  }, [debouncedPhone, plainPhoneMode]);

  useEffect(() => {
    const fullDigits = plainPhoneMode
      ? digitsOnly(debouncedPhone)
      : digitsOnly(fullPhoneFromNational(nationalFromPhoneDigits(debouncedPhone)));
    const ready = plainPhoneMode
      ? isAdminPhoneContextReady(fullDigits) || fullDigits.length >= 8
      : fullDigits.length >= 10;
    if (!ready) {
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
  }, [debouncedPhone, plainPhoneMode]);

  useEffect(() => {
    const phoneKey = plainPhoneMode
      ? digitsOnly(debouncedPhone)
      : fullPhoneFromNational(nationalFromPhoneDigits(debouncedPhone));
    const complete = plainPhoneMode
      ? isPlainByPhoneComplete(phoneKey)
      : clampNationalDigits(nationalFromPhoneDigits(phoneKey)).length === 9;
    if (!complete) {
      autoCustomerNamePhoneRef.current = "";
      return;
    }

    const suggested =
      context?.matched_user?.name?.trim() || context?.customer_name?.trim() || "";
    if (!suggested) return;

    const initialKey = phoneDigitsFromStored(initialOrder?.phone ?? "");
    if (initialOrder && phoneKey === initialKey) {
      autoCustomerNamePhoneRef.current = phoneKey;
      return;
    }

    if (autoCustomerNamePhoneRef.current === phoneKey) return;

    const parts = parseCustomerNameParts(suggested);
    setCustomerFirstName(parts.first);
    setCustomerLastName(parts.last);
    setCustomerPatronymic(parts.patronymic);
    autoCustomerNamePhoneRef.current = phoneKey;
  }, [context?.matched_user?.name, context?.customer_name, debouncedPhone, plainPhoneMode, initialOrder]);

  useEffect(() => {
    setDiscountCardManuallyCleared(false);
    const phoneKey = plainPhoneMode
      ? digitsOnly(debouncedPhone)
      : fullPhoneFromNational(nationalFromPhoneDigits(debouncedPhone));
    const initialKey = phoneDigitsFromStored(initialOrder?.phone ?? "");
    if (initialOrder && phoneKey === initialKey) {
      return;
    }
    setAppliedDiscountCardNumber("");
    setDiscountCardInput("");
    setDiscountCardError("");
  }, [debouncedPhone, plainPhoneMode, initialOrder]);

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
        setBelarusCityLookupFailed(false);
      });
    }
  }, [deliveryMethod]);

  useEffect(() => {
    if (deliveryMethod !== "belarus_courier") return;
    if (deliveryCityId) {
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
  }, [debouncedBelarusCityQuery, deliveryCityId, deliveryMethod]);

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
    () =>
      JSON.stringify(
        filledLinesForQuote.map((l) => ({
          variant_id: l.variant_id,
          qty: l.qty,
          price: l.price,
        })),
      ),
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
      delivery_method: deliveryMethod,
      discount_card_number: appliedDiscountCardNumber.trim() || null,
      gift_certificate_code: appliedGiftCertificateCode.trim() || null,
      order_id: isEdit ? initialOrderId : null,
      items: filledLinesForQuote.map((l) => ({
        qty: Math.max(1, l.qty),
        price: Math.max(0, l.price),
        variant_id: l.variant_id,
      })),
    })
      .then((response) => {
        if (!cancelled) {
          setOrderQuote(response.data);
          const fee = Number.parseFloat(String(response.data.delivery_fee ?? "").replace(",", "."));
          if (Number.isFinite(fee)) {
            setDeliveryFee(Math.max(0, fee));
          }
          setDiscountCardError("");
          setGiftCertificateError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setOrderQuote(null);
          const msg = err instanceof Error ? err.message : "Не удалось пересчитать скидки";
          if (/сертификат/i.test(msg)) {
            setGiftCertificateError(msg);
            setAppliedGiftCertificateCode("");
          } else {
            setDiscountCardError(msg);
            setAppliedDiscountCardNumber("");
          }
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
  }, [
    quoteItemsKey,
    paymentMethod,
    deliveryMethod,
    appliedDiscountCardNumber,
    appliedGiftCertificateCode,
    filledLinesForQuote,
    isEdit,
    initialOrderId,
  ]);

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
  const giftCertificateAmountStr = orderQuote?.gift_certificate_amount ?? "0.00";
  const merchandiseTotalStr = orderQuote?.merchandise_total ?? localSubtotal.toFixed(2);
  const deliveryFeeStr = Math.max(0, Number(deliveryFee) || 0).toFixed(2);
  const orderTotalStr = (
    Math.max(0, parseQuoteMoney(merchandiseTotalStr) - parseQuoteMoney(giftCertificateAmountStr)) +
    Math.max(0, Number(deliveryFee) || 0)
  ).toFixed(2);
  const loyaltyPercentStr = orderQuote?.loyalty_discount_percent ?? "0.00";
  const hasLoyaltyDiscount = parseQuoteMoney(loyaltyDiscountStr) > 0.004;
  const hasGiftCertificateDiscount = parseQuoteMoney(giftCertificateAmountStr) > 0.004;
  const orderItemsQty = filledLinesForQuote.reduce((sum, line) => sum + Math.max(0, line.qty), 0);
  const deliveryMethodLabel =
    DELIVERY_OPTIONS.find((opt) => opt.value === deliveryMethod)?.label ?? deliveryMethod;
  const paymentMethodLabel =
    PAYMENT_OPTIONS.find((opt) => opt.value === paymentMethod)?.label ?? paymentMethod;

  const giftCertificateConfirmed = Boolean(
    appliedGiftCertificateCode.trim() &&
    orderQuote?.gift_certificate_code?.trim() &&
    orderQuote.gift_certificate_code.trim() === appliedGiftCertificateCode.trim(),
  );

  const discountCardNumberDisplay = appliedDiscountCardNumber.trim();
  const discountCardMatchesInitial =
    discountCardNumberDisplay !== "" &&
    discountCardNumberDisplay === (initialOrder?.discount_card_number?.trim() ?? "");
  const discountPercentDisplay =
    orderQuote?.loyalty_discount_percent ??
    (discountCardMatchesInitial ? initialOrder?.discount_percent_snapshot : undefined) ??
    "0.00";
  const discountAmountDisplay =
    orderQuote?.loyalty_discount_amount ??
    (discountCardMatchesInitial ? initialOrder?.discount_amount : undefined) ??
    "0.00";
  const hasDiscountCardDisplay =
    discountCardNumberDisplay !== "" ||
    parseQuoteMoney(discountPercentDisplay) > 0.004 ||
    parseQuoteMoney(discountAmountDisplay) > 0.004;

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
          delivery_method: deliveryMethod,
          discount_card_number: normalized,
          gift_certificate_code: appliedGiftCertificateCode.trim() || null,
          order_id: isEdit ? initialOrderId : null,
          items: filledLinesForQuote.map((l) => ({
            qty: Math.max(1, l.qty),
            price: Math.max(0, l.price),
            variant_id: l.variant_id,
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
        const fee = Number.parseFloat(String(response.data.delivery_fee ?? "").replace(",", "."));
        if (Number.isFinite(fee)) {
          setDeliveryFee(Math.max(0, fee));
        }
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
    [appliedGiftCertificateCode, deliveryMethod, filledLinesForQuote, initialOrderId, isEdit, paymentMethod],
  );

  const seedCardValidatedRef = useRef(false);
  useEffect(() => {
    if (seedCardValidatedRef.current) return;
    if (itemsLocked) return;
    if (!isCopy && !(isEdit && initialOrder?.status === "cancelled")) return;
    const card = appliedDiscountCardNumber.trim();
    if (!card || filledLinesForQuote.length === 0) return;
    seedCardValidatedRef.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchAdminOrderQuote({
          payment_method: paymentMethod,
          delivery_method: deliveryMethod,
          discount_card_number: card,
          gift_certificate_code: appliedGiftCertificateCode.trim() || null,
          order_id: isEdit ? initialOrderId : null,
          items: filledLinesForQuote.map((l) => ({
            qty: Math.max(1, l.qty),
            price: Math.max(0, l.price),
            variant_id: l.variant_id,
          })),
        });
        if (cancelled) return;
        const confirmed = response.data.discount_card_number?.trim() ?? "";
        if (confirmed === "") {
          setDiscountCardError("Скидочная карта не найдена или неактивна.");
          return;
        }
        setOrderQuote(response.data);
      } catch (err) {
        if (cancelled) return;
        setDiscountCardError(
          err instanceof Error ? err.message : "Скидочная карта не найдена или неактивна.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    appliedDiscountCardNumber,
    appliedGiftCertificateCode,
    deliveryMethod,
    filledLinesForQuote,
    initialOrder?.status,
    initialOrderId,
    isCopy,
    isEdit,
    itemsLocked,
    paymentMethod,
  ]);

  const applyGiftCertificateToOrder = useCallback(
    async (codeRaw: string) => {
      const normalized = normalizeGiftCertificateCodeInput(codeRaw);
      if (!normalized) {
        return;
      }
      if (filledLinesForQuote.length === 0) {
        setGiftCertificateError("Сначала добавьте хотя бы одну позицию в заказ, чтобы применить сертификат.");
        return;
      }

      setGiftCertificateError("");
      setOrderQuoteLoading(true);
      try {
        const response = await fetchAdminOrderQuote({
          payment_method: paymentMethod,
          delivery_method: deliveryMethod,
          discount_card_number: appliedDiscountCardNumber.trim() || null,
          gift_certificate_code: normalized,
          order_id: isEdit ? initialOrderId : null,
          items: filledLinesForQuote.map((l) => ({
            qty: Math.max(1, l.qty),
            price: Math.max(0, l.price),
            variant_id: l.variant_id,
          })),
        });
        const confirmed = response.data.gift_certificate_code?.trim() ?? "";
        if (confirmed === "") {
          setAppliedGiftCertificateCode("");
          setGiftCertificateError("Не удалось применить сертификат.");
          return;
        }
        setAppliedGiftCertificateCode(confirmed);
        setGiftCertificateInput(confirmed);
        setOrderQuote(response.data);
        const fee = Number.parseFloat(String(response.data.delivery_fee ?? "").replace(",", "."));
        if (Number.isFinite(fee)) {
          setDeliveryFee(Math.max(0, fee));
        }
      } catch (err) {
        setAppliedGiftCertificateCode("");
        setGiftCertificateError(err instanceof Error ? err.message : "Не удалось применить сертификат.");
      } finally {
        setOrderQuoteLoading(false);
      }
    },
    [appliedDiscountCardNumber, deliveryMethod, filledLinesForQuote, initialOrderId, isEdit, paymentMethod],
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

  const selectPhoneHit = (u: AdminClient) => {
    const d = digitsOnly(u.phone ?? "");
    if (shouldUsePlainPhoneUi(d)) {
      setPlainPhoneMode(true);
      setPhoneDigits(d.slice(0, ADMIN_PHONE_MAX_DIGITS));
    } else {
      setPlainPhoneMode(false);
      setPhoneDigits(d.startsWith(PHONE_PREFIX) ? d.slice(0, 12) : fullPhoneFromNational(d));
    }
    const fn = u.first_name?.trim() || "";
    const ln = u.last_name?.trim() || "";
    const pn = u.patronymic?.trim() || "";
    if (ln && fn && !/\s/.test(fn)) {
      setCustomerFirstName(fn);
      setCustomerLastName(ln);
      setCustomerPatronymic(pn);
    } else {
      const parts = parseCustomerNameParts(fn && /\s/.test(fn) ? fn : u.name || "");
      setCustomerFirstName(parts.first || (!/\s/.test(fn) ? fn : ""));
      setCustomerLastName(parts.last || ln);
      setCustomerPatronymic(parts.patronymic || pn);
    }
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
      if (productHitsListRef.current?.contains(e.target as Node)) return;
      closeProductPicker();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [productPickerOpen, closeProductPicker]);

  const updateProductHitsPosition = useCallback(() => {
    const el = productSearchInputRef.current;
    if (!el) {
      setProductHitsPos(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const gap = 4;
    const preferredMax = 240;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(preferredMax, openUp ? spaceAbove : spaceBelow));
    setProductHitsPos({
      left: rect.left,
      width: rect.width,
      top: openUp ? rect.top - gap : rect.bottom + gap,
      maxHeight,
      openUp,
    });
  }, []);

  useLayoutEffect(() => {
    if (activeLine === null) {
      setProductHitsPos(null);
      return;
    }
    updateProductHitsPosition();
    window.addEventListener("resize", updateProductHitsPosition);
    window.addEventListener("scroll", updateProductHitsPosition, true);
    return () => {
      window.removeEventListener("resize", updateProductHitsPosition);
      window.removeEventListener("scroll", updateProductHitsPosition, true);
    };
  }, [
    activeLine,
    productHits,
    productHitsLoading,
    debouncedProductQ,
    loadingProductLineIdx,
    updateProductHitsPosition,
  ]);

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
      const catalogPrice = Number(variant.price ?? variantPreview.price ?? 0);
      const fulfillment = defaultFulfillment(
        Boolean(variant.can_fulfill_main ?? variantPreview.can_fulfill_main),
        Boolean(variant.can_fulfill_offer ?? variantPreview.can_fulfill_offer),
      );
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
              base_price: catalogPrice,
              price: priceWithOptionalWaiting(catalogPrice, fulfillment.waiting_discount),
              fulfillment_options: row.fulfillment_options,
              main_lot_choices: [],
              selected_lot_id: null,
              offer_choices: offerChoicesFromFulfillment(row.fulfillment_options),
              selected_offer_id:
                channelFromSource(fulfillment.availability_source) === "offer"
                  ? pickPreferredOfferId(offerChoicesFromFulfillment(row.fulfillment_options))
                  : null,
              ...fulfillment,
              availability_issue: availabilityIssueForLine(
                channelFromSource(fulfillment.availability_source),
                fulfillment.can_fulfill_main,
                fulfillment.can_fulfill_offer,
              ),
            }
            : row,
        ),
      );
      setActiveLine(null);
      setPickerProductId(null);
      if (variant.can_fulfill_main ?? variantPreview.can_fulfill_main) {
        const priorOptions = lines[lineIdx]?.fulfillment_options ?? [];
        void syncMainLotsForLine(lineIdx, variant.id, priorOptions);
      }
    } finally {
      setLoadingProductLineIdx(null);
    }
  };

  const pickVariantForLine = (lineIdx: number, detail: ProductAdminDetail, variantId: number) => {
    if (itemsLocked) return;
    setVariantTooltip(null);
    const v = detail.variants?.find((x) => x.id === variantId);
    if (!v) return;
    const catalogPrice = Number(v.price ?? 0);
    const fulfillment = defaultFulfillment(Boolean(v.can_fulfill_main), Boolean(v.can_fulfill_offer));
    setLines((prev) =>
      prev.map((row, i) =>
        i === lineIdx
          ? {
            ...row,
            variant_id: v.id,
            variant_title: v.title || v.display_name || "",
            sku: v.display_name ?? row.sku,
            base_price: catalogPrice,
            price: priceWithOptionalWaiting(catalogPrice, fulfillment.waiting_discount),
            main_lot_choices: [],
            selected_lot_id: null,
            offer_choices: offerChoicesFromFulfillment(row.fulfillment_options),
            selected_offer_id:
              channelFromSource(fulfillment.availability_source) === "offer"
                ? pickPreferredOfferId(offerChoicesFromFulfillment(row.fulfillment_options))
                : null,
            ...fulfillment,
            availability_issue: availabilityIssueForLine(
              channelFromSource(fulfillment.availability_source),
              fulfillment.can_fulfill_main,
              fulfillment.can_fulfill_offer,
            ),
          }
          : row,
      ),
    );
    if (v.can_fulfill_main) {
      const priorOptions = lines[lineIdx]?.fulfillment_options ?? [];
      void syncMainLotsForLine(lineIdx, v.id, priorOptions);
    }
    setActiveLine(null);
    setPickerProductId(null);
    setProductHits([]);
  };

  const setLineQty = (idx: number, qty: number) => {
    if (itemsLocked) return;
    setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, qty: Math.max(1, qty) } : row)));
  };

  const setLineSelectedLot = (idx: number, lotId: number | null) => {
    if (itemsLocked) return;
    setLines((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, selected_lot_id: lotId } : row)),
    );
  };

  const setLineSelectedOffer = (idx: number, offerId: number | null) => {
    if (itemsLocked) return;
    setLines((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, selected_offer_id: offerId } : row)),
    );
  };

  const setLineChannel = (idx: number, channel: FulfillmentChannel) => {
    if (itemsLocked) return;
    setLines((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        if (channel === "main" && !row.can_fulfill_main) return row;
        if (channel === "offer" && !row.can_fulfill_offer) return row;
        const base = row.base_price > 0 ? row.base_price : row.price;
        const waiting = channel === "offer";
        return {
          ...row,
          availability_source: sourceFromChannel(
            channel,
            row.availability_source,
            row.can_fulfill_main,
            row.can_fulfill_offer,
          ),
          waiting_discount: waiting,
          base_price: base,
          price: priceWithOptionalWaiting(base, waiting),
          selected_lot_id: channel === "main"
            ? (row.selected_lot_id ?? pickPreferredLotId(row.main_lot_choices))
            : null,
          selected_offer_id: channel === "offer"
            ? (row.selected_offer_id ?? pickPreferredOfferId(row.offer_choices))
            : null,
          availability_issue: availabilityIssueForLine(
            channel,
            row.can_fulfill_main,
            row.can_fulfill_offer,
          ),
        };
      }),
    );
  };

  const setLinePrice = (idx: number, price: number) => {
    if (itemsLocked) return;
    const next = Math.max(0, Number.isFinite(price) ? price : 0);
    setLines((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        // Ручная правка цены: при офере считаем это уже ценой со скидкой; база для инфо пересчитывается.
        if (row.waiting_discount) {
          return {
            ...row,
            price: next,
            base_price: estimateBaseFromWaitingPrice(next),
          };
        }
        return { ...row, price: next, base_price: next };
      }),
    );
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
    if (deliveryMethod === "belarus_courier") return deliveryCity.trim();
    let city = "";
    if (citySelect === "__new__") city = deliveryCity.trim();
    else if (citySelect) city = citySelect.trim();
    else city = deliveryCity.trim();
    return city;
  }, [deliveryMethod, citySelect, deliveryCity]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const resolvedPhone = plainPhoneMode
      ? digitsOnly(phoneDigits)
      : fullPhoneFromNational(nationalFromPhoneDigits(phoneDigits));
    if (!isValidAdminOrderPhone(resolvedPhone, plainPhoneMode)) {
      setError(
        plainPhoneMode
          ? "Укажите номер с кодом страны: 8–15 цифр"
          : "Введите 9 цифр после +375 (код 25, 29, 33 или 44)",
      );
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
    const missingLotLine = filledLines.find(
      (line) =>
        channelFromSource(line.availability_source) === "main" &&
        line.main_lot_choices.length > 0 &&
        !line.selected_lot_id,
    );
    if (missingLotLine) {
      setError("Для позиций со склада выберите партию для списания");
      return;
    }
    if (deliveryMethod !== "pickup") {
      if (!deliveryAddress.trim()) {
        setError("Укажите адрес доставки");
        return;
      }
      if (deliveryMethod === "belarus_courier" && !deliveryCityId) {
        setError("Выберите населённый пункт из списка");
        return;
      }
    }

    const addr =
      deliveryMethod === "pickup" ? "Самовывоз" : deliveryAddress.trim();

    const payload: AdminOrderPayload = {
      customer_name:
        buildCustomerName({
          first: customerFirstName,
          last: customerLastName,
          patronymic: customerPatronymic,
        }) || null,
      phone: resolvedPhone,
      comment: comment.trim() || null,
      manager_comment: managerComment.trim() || null,
      status: orderStatus,
      delivery_method: deliveryMethod,
      delivery_city: deliveryMethod === "pickup" ? null : resolvedCity || null,
      delivery_city_id: deliveryMethod === "belarus_courier" ? deliveryCityId : null,
      delivery_address: addr,
      delivery_street_prefix:
        deliveryMethod === "pickup" ? null : deliveryStreetPrefix.trim() || null,
      delivery_house: deliveryMethod === "pickup" ? null : deliveryHouse.trim() || null,
      delivery_korpus: deliveryMethod === "pickup" ? null : deliveryKorpus.trim() || null,
      delivery_apartment:
        deliveryMethod === "pickup" ? null : deliveryApartment.trim() || null,
      delivery_comment:
        deliveryMethod === "pickup" ? null : deliveryComment.trim() || null,
      shipment_id:
        deliveryMethod === "minsk_courier" || deliveryMethod === "belarus_courier"
          ? shipmentId.trim() || null
          : null,
      shipment_date: shipmentDate.trim() || format(new Date(), "yyyy-MM-dd"),
      delivery_date: courierDeliveryDate.trim() || null,
      delivery_time_from: deliveryTimeFrom.trim()
        ? snapDeliveryClockToTenMinutes(deliveryTimeFrom)
        : null,
      delivery_time_to: deliveryTimeTo.trim()
        ? snapDeliveryClockToTenMinutes(deliveryTimeTo)
        : null,
      delivery_fee: Math.max(0, Number(deliveryFee) || 0),
      payment_method: paymentMethod,
      discount_card_number: appliedDiscountCardNumber.trim() || null,
      gift_certificate_code: appliedGiftCertificateCode.trim() || null,
      tag_ids: selectedTags.map((t) => t.id),
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
        availability_source: item.availability_source,
        waiting_discount: item.waiting_discount,
        ...(channelFromSource(item.availability_source) === "main" && item.selected_lot_id
          ? {
              stock_lot_allocations: [
                { lot_id: item.selected_lot_id, qty: Math.max(1, item.qty) },
              ],
            }
          : {}),
        ...(channelFromSource(item.availability_source) === "offer" && item.selected_offer_id
          ? { supplier_variant_offer_id: item.selected_offer_id }
          : { supplier_variant_offer_id: null }),
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

  const canDeleteOrder =
    isEdit &&
    initialOrder != null &&
    !["done", "completed"].includes(String(initialOrder.status));

  const handleDeleteOrder = async () => {
    if (!initialOrder || !canDeleteOrder || deleting) return;
    setError("");
    setDeleting(true);
    try {
      await deleteOrder(initialOrder.id);
      setConfirmDeleteOpen(false);
      router.push("/admin/orders?deleted=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить заказ");
      setConfirmDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const savedCities = context?.delivery_cities ?? [];
  const showCitySelect =
    savedCities.length > 0 && deliveryMethod !== "pickup" && deliveryMethod !== "belarus_courier";

  const nationalLive = nationalFromPhoneDigits(phoneDigits);
  const nationalDebounced = nationalFromPhoneDigits(debouncedPhone);
  const showPhoneClientPanel =
    phoneHitsOpen &&
    (plainPhoneMode
      ? digitsOnly(phoneDigits).length >= PHONE_CLIENT_HINT_MIN_NATIONAL
      : nationalLive.length >= PHONE_CLIENT_HINT_MIN_NATIONAL);
  const hasOrderHistoryByPhone = totalOrdersCount(context) > 0;

  const belarusCitySearch = (
    <div className="relative">
      <input
        value={deliveryCity.trim() || belarusCityQuery}
        onChange={(e) => {
          const v = e.target.value;
          setBelarusCityQuery(v);
          if (deliveryCity.trim() || deliveryCityId) {
            setDeliveryCity("");
            setDeliveryCityId(null);
            setBelarusDeliveryDays(null);
            setCourierDeliveryDate("");
          }
          setBelarusCityOpen(true);
          setBelarusCityLookupFailed(false);
        }}
        onFocus={() => setBelarusCityOpen(true)}
        className={surfaceFieldClass}
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
                  setDeliveryCity(h.full_name.trim());
                  setDeliveryCityId(h.id);
                  setBelarusDeliveryDays(h.delivery_days);
                  setBelarusCityQuery("");
                  setBelarusCityOpen(false);
                  setCourierDeliveryDate((prev) => {
                    if (!prev) return prev;
                    const key = weekdayKeyFromIsoDate(prev);
                    if (!key || h.delivery_days[key] !== 1) return "";
                    return prev;
                  });
                }}
              >
                <div className="font-medium text-admin-text">{h.full_name}</div>
                <div className="mt-1">
                  <DeliveryDaysBadges days={h.delivery_days} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {deliveryCityId && belarusDeliveryDays ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[11px] text-admin-text-secondary">Дни доставки:</span>
          <DeliveryDaysBadges
            days={belarusDeliveryDays}
            selectedDate={courierDeliveryDate}
            allowToday={false}
            interactive
            onSelectDate={setCourierDeliveryDate}
          />
          {courierDeliveryDate ? (
            <span className="text-[11px] tabular-nums text-emerald-800">
              {formatIsoDateShortRu(courierDeliveryDate)}
            </span>
          ) : (
            <span className="text-[11px] text-admin-text-secondary">выберите день</span>
          )}
        </div>
      ) : null}
      {!deliveryCityId &&
        belarusCityQuery.trim().length >= 2 &&
        belarusCityHits.length === 0 ? (
        <p className="mt-2 text-xs text-admin-text-secondary">
          {belarusCityLookupFailed
            ? "Поиск временно недоступен."
            : "Населённый пункт не найден в списке — выберите из подсказок."}
        </p>
      ) : null}
      {deliveryMethod === "belarus_courier" && !deliveryCityId && initialOrder?.delivery_city ? (
        <p className="mt-2 text-xs text-amber-700">
          Старый заказ без ID ветерОК — выберите населённый пункт из списка заново.
        </p>
      ) : null}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

      <SectionCard className="!space-y-2 !p-3 sm:!p-3.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="shrink-0 text-sm font-semibold text-admin-text">Теги</h2>
          <div className="min-w-0 flex-1">
            <AdminOrderTagsPicker selected={selectedTags} onChangeAction={setSelectedTags} compact />
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <h2 className="text-sm font-semibold text-admin-text">Клиент</h2>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-5">
          <div className="flex w-full shrink-0 flex-col gap-3.5 rounded-xl border border-admin-border/90 bg-admin-muted/50 p-3.5 sm:max-w-[22rem] lg:max-w-[26rem]">
            <div className="relative">
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-xs font-medium text-admin-text-secondary">Телефон *</label>
                <button
                  type="button"
                  className="text-[11px] font-medium text-admin-primary hover:underline"
                  onClick={() => {
                    setPlainPhoneMode((prev) => {
                      if (prev) {
                        const d = digitsOnly(phoneDigits);
                        const national = d.startsWith(PHONE_PREFIX)
                          ? d.slice(PHONE_PREFIX.length).slice(0, 9)
                          : "";
                        setPhoneDigits(national ? fullPhoneFromNational(national) : "");
                        return false;
                      }
                      setPhoneDigits(digitsOnly(phoneDigits).slice(0, ADMIN_PHONE_MAX_DIGITS));
                      return true;
                    });
                  }}
                >
                  {plainPhoneMode ? "Белорусский мобильный" : "Международный номер"}
                </button>
              </div>

              {plainPhoneMode ? (
                <input
                  value={digitsOnly(phoneDigits)}
                  onChange={(e) => {
                    setPhoneDigits(e.target.value.replace(/\D/g, "").slice(0, ADMIN_PHONE_MAX_DIGITS));
                    setPhoneHitsOpen(true);
                  }}
                  onFocus={() => setPhoneHitsOpen(true)}
                  onBlur={() => setTimeout(() => setPhoneHitsOpen(false), 150)}
                  className="w-full rounded-lg border border-admin-border bg-admin-bg px-2.5 py-2 font-mono text-sm text-admin-text outline-none transition focus:border-admin-primary focus:ring-2 focus:ring-admin-primary/20"
                  placeholder="79001234567"
                  inputMode="numeric"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              ) : (
                <div className="flex overflow-hidden rounded-lg border border-admin-border bg-admin-bg transition focus-within:border-admin-primary focus-within:ring-2 focus-within:ring-admin-primary/20">
                  <span className="flex shrink-0 items-center border-r border-admin-border px-2.5 text-sm tabular-nums text-admin-text-secondary">
                    +375
                  </span>
                  <input
                    value={formatNationalDisplay(nationalLive)}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      if (!raw.startsWith(PHONE_PREFIX) && raw.length >= 10) {
                        setPlainPhoneMode(true);
                        setPhoneDigits(raw.slice(0, ADMIN_PHONE_MAX_DIGITS));
                        setPhoneHitsOpen(true);
                        return;
                      }
                      setPhoneDigits(fullPhoneFromNational(clampNationalDigits(e.target.value)));
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
              )}

              {showPhoneClientPanel ? (
                <div className="absolute z-30 mt-1 max-h-52 w-full min-w-[16rem] overflow-auto rounded-lg border border-admin-border bg-admin-surface py-1 shadow-lg">
                  {phoneHitsLoading ||
                    (plainPhoneMode
                      ? digitsOnly(debouncedPhone).length < PHONE_CLIENT_HINT_MIN_NATIONAL
                      : nationalDebounced.length < PHONE_CLIENT_HINT_MIN_NATIONAL) ? (
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
                <span className="rounded-lg bg-admin-primary/12 px-2 py-0.5 text-[11px] font-medium text-admin-primary">
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
                          className={`inline-flex min-w-[5.5rem] flex-col items-start rounded-lg border px-2.5 py-2 text-left transition ${clickable
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
                          className="inline-flex items-center gap-1 rounded-lg bg-admin-surface px-2 py-1 font-mono text-xs text-admin-text shadow-sm ring-1 ring-admin-border/80"
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
        {isCopy ? (
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            Копия заказа #{copyFromOrder?.id}. Новый номер появится после сохранения. Недоступные позиции подсвечены.
          </p>
        ) : null}
        {itemsLocked ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Заказ в статусе «Выполнен» — состав строк и цены нельзя менять. Можно править контакты, доставку и
            комментарий.
          </p>
        ) : null}
        {!itemsLocked && appliedDiscountCardNumber.trim() && discountCardError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            Скидочная карта {appliedDiscountCardNumber}: {discountCardError}
          </p>
        ) : null}
        <div className="space-y-2">
          {lines.some(isCompleteOrderLine) ? (
            <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-admin-border/60">
              <div
                className={`${orderLineTableRow} border-b border-admin-border/80 bg-admin-muted/55 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-admin-text-secondary`}
              >
                <span className={orderLineColName}>Наименование</span>
                <span className={orderLineColFrom}>Откуда</span>
                <span className={`${orderLineColQty} text-center`}>Кол-во</span>
                <span className={`${orderLineColPrice} text-right`}>Цена</span>
                <span className={`${orderLineColTotal} text-right`}>Итого</span>
                <span className={`${orderLineColActions} sr-only`}>Действия</span>
              </div>
              <div className="divide-y divide-admin-border/70">
                {lines.map((line, idx) => {
                  if (!isCompleteOrderLine(line)) return null;
                  const channel = channelFromSource(line.availability_source);
                  const canPickChannel = line.can_fulfill_main || line.can_fulfill_offer;
                  const selectedLot = line.main_lot_choices.find((lot) => lot.lot_id === line.selected_lot_id) ?? null;
                  const selectValue: FulfillmentChannel =
                    channel === "offer" || (!line.can_fulfill_main && line.can_fulfill_offer)
                      ? "offer"
                      : "main";
                  const hasAvailabilityIssue = Boolean(line.availability_issue);
                  return (
                    <div
                      key={`line-${idx}`}
                      className={`${orderLineTableRow} px-3 py-2 ${
                        hasAvailabilityIssue
                          ? "border-l-4 border-l-amber-500 bg-amber-50/80"
                          : "bg-admin-muted/25"
                      }`}
                    >
                      <div className={`${orderLineColName} space-y-1`}>
                        <p className="truncate text-sm leading-snug text-admin-text">
                          <span className="font-medium">
                            {formatOrderLineProductLabel(line)}
                          </span>
                          {line.variant_title ? (
                            <span className="font-normal text-admin-text-secondary"> - {line.variant_title}</span>
                          ) : null}
                        </p>
                        {line.availability_issue ? (
                          <p className="text-[11px] font-medium leading-snug text-amber-800">
                            {line.availability_issue}
                          </p>
                        ) : null}
                        {line.fulfillment_options.length > 0 ? (
                          <ul className="min-w-0 space-y-0.5 text-[11px] leading-snug text-admin-text-secondary">
                            {line.fulfillment_options.map((opt, optIdx) => {
                              const detailParts = [
                                opt.code,
                                opt.title,
                                formatPurchasePriceTenths(opt.purchase_price),
                                opt.qty !== 0 ? `${opt.qty} шт.` : null,
                                opt.comment?.trim() || null,
                                opt.lot_id ? `#${opt.lot_id}` : null,
                              ].filter(Boolean);
                              const detailText = detailParts.join(" · ");
                              const fullText = detailText ? `${opt.label} · ${detailText}` : opt.label;
                              return (
                                <li
                                  key={`${opt.channel}-${opt.code ?? optIdx}-${optIdx}`}
                                  className="block min-w-0 truncate"
                                  title={fullText}
                                >
                                  <span className="font-medium text-admin-text">{opt.label}</span>
                                  {detailText ? <>{" · "}{detailText}</> : null}
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                        {selectValue === "main" && selectedLot ? (
                          <div
                            className="truncate text-[11px] leading-snug text-admin-text-secondary"
                            title={`Партия #${selectedLot.lot_id} · ${selectedLot.label}`}
                          >
                            <span className="font-medium text-admin-text">Партия:</span>{" "}
                            {`#${selectedLot.lot_id} · ${selectedLot.label}`}
                          </div>
                        ) : null}
                      </div>
                      <div className={`${orderLineColFrom} self-start space-y-1 pt-0.5`}>
                        {!canPickChannel && !channel ? (
                          <p className="text-xs leading-snug text-admin-text-secondary">
                            Нет склада и офера — выбирать не из чего
                          </p>
                        ) : itemsLocked || !canPickChannel ? (
                          <p className="text-xs leading-snug text-admin-text">
                            {channel === "main" ? "Склад" : channel === "offer" ? "Офер" : "—"}
                          </p>
                        ) : (
                          <AdminStatusDropdown
                            value={selectValue}
                            onChangeAction={(value) => setLineChannel(idx, value as FulfillmentChannel)}
                            options={[
                              ...(line.can_fulfill_main
                                ? [{ value: "main", label: "Склад", triggerLabel: "Склад", menuLabel: "Склад" }]
                                : []),
                              ...(line.can_fulfill_offer
                                ? [{ value: "offer", label: "Офер", triggerLabel: "Офер", menuLabel: "Офер" }]
                                : []),
                            ]}
                            triggerVariant="text"
                            triggerTextClassName="bg-admin-surface text-admin-text ring-1 ring-inset ring-admin-border/80"
                            widthClassName="w-[6.25rem]"
                            menuWidthClassName="w-[180px]"
                          />
                        )}
                        {selectValue === "main" && line.main_lot_choices.length > 0 ? (
                          itemsLocked ? (
                            null
                          ) : (
                            <AdminStatusDropdown
                              value={line.selected_lot_id != null ? String(line.selected_lot_id) : ""}
                              onChangeAction={(nextValue) =>
                                setLineSelectedLot(idx, nextValue ? Number(nextValue) : null)
                              }
                              options={line.main_lot_choices.map((lot) => ({
                                value: String(lot.lot_id),
                                label: `#${lot.lot_id}`,
                                triggerLabel: `#${lot.lot_id}`,
                                menuLabel: `#${lot.lot_id} · ${lot.label}`,
                              }))}
                              triggerVariant="text"
                              triggerTextClassName="bg-admin-surface text-admin-text ring-1 ring-inset ring-admin-border/80"
                              widthClassName="w-[6.25rem]"
                              menuWidthClassName="w-max min-w-[22rem] max-w-[min(94vw,44rem)]"
                            />
                          )
                        ) : null}
                        {selectValue === "offer" && line.offer_choices.length > 0 ? (
                          itemsLocked ? (
                            <p className="truncate text-[11px] leading-snug text-admin-text-secondary">
                              {line.offer_choices.find((o) => o.offer_id === line.selected_offer_id)?.label ??
                                "Офер"}
                            </p>
                          ) : (
                            <AdminStatusDropdown
                              value={line.selected_offer_id != null ? String(line.selected_offer_id) : ""}
                              onChangeAction={(nextValue) =>
                                setLineSelectedOffer(idx, nextValue ? Number(nextValue) : null)
                              }
                              options={line.offer_choices.map((offer) => ({
                                value: String(offer.offer_id),
                                label: offer.label,
                                triggerLabel: offer.label.split(" · ")[0] || offer.label,
                                menuLabel: offer.label,
                              }))}
                              triggerVariant="text"
                              triggerTextClassName="bg-admin-surface text-admin-text ring-1 ring-inset ring-admin-border/80"
                              widthClassName="w-[6.25rem]"
                              menuWidthClassName="w-max min-w-[22rem] max-w-[min(94vw,44rem)]"
                            />
                          )
                        ) : null}
                      </div>
                      <div className={`${orderLineColQty} self-start pt-0.5`}>
                        {itemsLocked ? (
                          <span className="inline-flex h-8 w-11 items-center justify-center rounded-lg bg-admin-surface text-sm font-medium tabular-nums ring-1 ring-inset ring-admin-border/70">
                            {line.qty}
                          </span>
                        ) : (
                          <input
                            type="number"
                            min={1}
                            aria-label={`Количество: ${formatOrderLineProductLabel(line)}`}
                            className="h-8 w-11 rounded-lg bg-admin-surface text-center text-sm font-medium tabular-nums ring-1 ring-inset ring-admin-border/70 outline-none transition focus:ring-2 focus:ring-admin-primary/25"
                            value={line.qty}
                            onChange={(e) => setLineQty(idx, Number(e.target.value))}
                          />
                        )}
                      </div>
                      <div className={`${orderLineColPrice} self-start pt-0.5 text-right`}>
                        {itemsLocked ? (
                          <p className="flex h-8 items-center justify-end text-sm tabular-nums text-admin-text">
                            {formatMoneyRub(line.price)}
                          </p>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            aria-label={`Цена: ${formatOrderLineProductLabel(line)}`}
                            className="h-8 w-full rounded-lg bg-admin-surface px-1.5 text-right text-sm tabular-nums ring-1 ring-inset ring-admin-border/70 outline-none transition focus:ring-2 focus:ring-admin-primary/25"
                            value={line.price}
                            onChange={(e) => setLinePrice(idx, Number(e.target.value))}
                          />
                        )}
                        {line.waiting_discount ? (
                          <div className="mt-0.5 space-y-0.5">
                            {line.base_price > 0 && line.base_price !== line.price ? (
                              <p className="text-[10px] tabular-nums text-admin-text-secondary line-through">
                                {formatMoneyRub(line.base_price)}
                              </p>
                            ) : null}
                            <p className="text-[10px] font-medium leading-tight text-amber-800">
                              −{WAITING_DISCOUNT_PERCENT}% ожидание
                            </p>
                          </div>
                        ) : null}
                      </div>
                      <p
                        className={`${orderLineColTotal} self-start pt-0.5 text-right text-sm font-semibold leading-8 tabular-nums text-admin-text`}
                      >
                        {formatMoneyRub(orderLineMerchandiseTotal(line))}
                      </p>
                      <div className={`${orderLineColActions} self-start pt-0.5`}>
                        {!itemsLocked ? (
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-admin-text-secondary transition hover:bg-red-50 hover:text-red-600"
                            aria-label={`Удалить ${formatOrderLineProductLabel(line)}`}
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
                className="rounded-lg border border-dashed border-admin-border/90 bg-admin-muted/25 px-3 py-2.5"
              >
                {itemsLocked ? (
                  <div className="text-xs text-admin-text-secondary">Позиция {idx + 1} — данные строки недоступны для редактирования.</div>
                ) : (
                  <div className="space-y-2" ref={isPickerHost ? productPickerRef : undefined}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-admin-text-secondary">Позиция {idx + 1}</div>
                      {!itemsLocked && lines.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-admin-text-secondary transition hover:bg-red-50 hover:text-red-600"
                          aria-label={`Удалить позицию ${idx + 1}`}
                          title="Удалить"
                        >
                          <Trash2 size={15} strokeWidth={1.75} />
                        </button>
                      ) : null}
                    </div>
                    <div className="relative">
                      <input
                        ref={showPicker ? productSearchInputRef : undefined}
                        value={line.product_name}
                        onFocus={() => openProductPicker(idx)}
                        onChange={(e) => {
                          openProductPicker(idx);
                          const v = e.target.value;
                          setLines((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, product_name: v } : row)),
                          );
                        }}
                        className={surfaceFieldClass}
                        placeholder="Название, артикул или код товара"
                      />
                      {showProductHitList && productHitsPos && typeof document !== "undefined"
                        ? createPortal(
                          <div
                            ref={productHitsListRef}
                            className="fixed z-[9999] overflow-auto rounded-xl border border-admin-border bg-admin-surface shadow-lg"
                            style={{
                              left: productHitsPos.left,
                              width: productHitsPos.width,
                              maxHeight: productHitsPos.maxHeight,
                              top: productHitsPos.top,
                              transform: productHitsPos.openUp ? "translateY(-100%)" : undefined,
                            }}
                          >
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
                          </div>,
                          document.body,
                        )
                        : null}
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
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-admin-border bg-admin-muted/20 px-3 py-2.5 text-sm font-medium text-admin-text-secondary transition hover:border-admin-primary/35 hover:bg-admin-muted/50 hover:text-admin-text disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={16} strokeWidth={2} />
            Добавить позицию
          </button>
        </div>
      </SectionCard>

      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold text-admin-text">Доставка и оплата</h2>
          {isEdit ? (
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-xs font-medium text-admin-text-secondary">Статус заказа</span>
              <AdminStatusDropdown
                value={orderStatus}
                options={statusDropdownOptions}
                onChangeAction={(nextStatus) => {
                  if (
                    initialOrder?.status === "cancelled" &&
                    nextStatus !== "cancelled" &&
                    orderStatus === "cancelled"
                  ) {
                    setPendingRestoreStatus(nextStatus);
                    setConfirmRestoreOpen(true);
                    return;
                  }
                  setOrderStatus(nextStatus);
                }}
                disabled={itemsLocked}
                triggerVariant="text"
                triggerColor={getOrderStatusColor(orderStatus, initialOrder?.status_color)}
                menuAlign="right"
              />
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
          <div className="flex h-full flex-col space-y-4 rounded-xl border border-admin-border bg-admin-muted/60 p-4">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-admin-text">Способ доставки *</legend>
              <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap">
                {DELIVERY_OPTIONS.map(({ value, label }) => {
                  const blockedByShipment =
                    shipmentBlocksNonRbDelivery &&
                    (value === "minsk_courier" || value === "pickup");
                  return (
                    <label
                      key={value}
                      className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text transition hover:bg-admin-muted/70 has-[:checked]:border-admin-primary/40 has-[:checked]:bg-admin-primary/5 sm:flex-1 ${
                        blockedByShipment ? "cursor-not-allowed opacity-40" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="delivery_method"
                        checked={deliveryMethod === value}
                        disabled={blockedByShipment}
                        onChange={() => handleDeliveryMethodChange(value)}
                        className="h-4 w-4 shrink-0 appearance-none rounded-full border border-admin-border bg-transparent checked:border-[5px] checked:border-admin-primary disabled:cursor-not-allowed"
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
              {shipmentBlocksNonRbDelivery ? (
                <p className="mt-2 text-xs text-admin-text-secondary">
                  Есть ID отправки — доступен только «Курьер по РБ». Чтобы выбрать Минск или самовывоз,
                  удалите ID отправки и сохраните заказ.
                </p>
              ) : null}
            </fieldset>

            {deliveryMethod !== "pickup" ? (
              <>
                {deliveryMethod === "minsk_courier" ? (
                  <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
                    <div>
                      <label className="block text-sm text-admin-text-secondary">Населённый пункт</label>
                      <input
                        type="text"
                        readOnly
                        value={MINSK_COURIER_CITY}
                        tabIndex={-1}
                        className="mt-1 w-full cursor-not-allowed rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text"
                        aria-readonly="true"
                      />
                    </div>
                    <label className="block text-sm text-admin-text-secondary">
                      ID отправки
                      <input
                        type="text"
                        value={shipmentId}
                        onChange={(e) => setShipmentId(e.target.value)}
                        className={`mt-1 ${surfaceFieldClass}`}
                        placeholder="Номер отправки"
                        autoComplete="off"
                      />
                    </label>
                  </div>
                ) : showCitySelect ? (
                  <div className="space-y-2">
                    <label className="block text-sm text-admin-text-secondary">Населённый пункт</label>
                    <select
                      value={citySelect}
                      onChange={(e) => setCitySelect(e.target.value)}
                      className={surfaceFieldClass}
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
                          className={surfaceFieldClass}
                          placeholder="Город (если не из списка)"
                        />
                      ))}
                  </div>
                ) : deliveryMethod === "belarus_courier" ? (
                  <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
                    <div>
                      <div className="text-sm text-admin-text-secondary">Населённый пункт</div>
                      <div className="mt-1">{belarusCitySearch}</div>
                    </div>
                    <label className="block text-sm text-admin-text-secondary">
                      ID отправки
                      <input
                        type="text"
                        value={shipmentId}
                        onChange={(e) => setShipmentId(e.target.value)}
                        className={`mt-1 ${surfaceFieldClass}`}
                        placeholder="Номер отправки"
                        autoComplete="off"
                      />
                    </label>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-[6rem_minmax(0,1fr)_3.5rem_3.5rem_3.5rem] sm:items-end">
                  <label className="col-span-1 block text-sm text-admin-text-secondary">
                    Тип
                    <div className="mt-1">
                      <StreetPrefixSelect
                        value={deliveryStreetPrefix}
                        onChange={setDeliveryStreetPrefix}
                        variant="admin"
                      />
                    </div>
                  </label>
                  <label className="col-span-2 block text-sm text-admin-text-secondary sm:col-span-1">
                    Адрес *
                    <input
                      type="text"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      className={`mt-1 ${surfaceFieldClass}`}
                      placeholder="Улица"
                    />
                  </label>
                  <label className="block text-sm text-admin-text-secondary">
                    Дом
                    <input
                      type="text"
                      value={deliveryHouse}
                      onChange={(e) => setDeliveryHouse(e.target.value)}
                      className={`mt-1 ${surfaceFieldCompactClass}`}
                      placeholder="№"
                      maxLength={4}
                    />
                  </label>
                  <label className="block text-sm text-admin-text-secondary">
                    Корп.
                    <input
                      type="text"
                      value={deliveryKorpus}
                      onChange={(e) => setDeliveryKorpus(e.target.value)}
                      className={`mt-1 ${surfaceFieldCompactClass}`}
                      placeholder="№"
                      maxLength={4}
                    />
                  </label>
                  <label className="block text-sm text-admin-text-secondary">
                    Кв.
                    <input
                      type="text"
                      value={deliveryApartment}
                      onChange={(e) => setDeliveryApartment(e.target.value)}
                      className={`mt-1 ${surfaceFieldCompactClass}`}
                      placeholder="№"
                      maxLength={4}
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
                  <div>
                    <div className="mb-1 text-sm text-admin-text-secondary">Дата отправки</div>
                    <AdminDatePicker value={shipmentDate} onChangeAction={setShipmentDate} />
                  </div>
                  {deliveryMethod === "minsk_courier" ? (
                    <div>
                      <div className="mb-1 text-sm text-admin-text-secondary">Дата доставки</div>
                      <AdminDatePicker
                        value={courierDeliveryDate}
                        onChangeAction={setCourierDeliveryDate}
                      />
                    </div>
                  ) : (
                    <div>
                      <div className="mb-1 text-sm text-admin-text-secondary">Время доставки</div>
                      <button
                        type="button"
                        onClick={() => {
                          setDraftDeliveryTimeFrom(
                            deliveryTimeFrom ? snapDeliveryClockToTenMinutes(deliveryTimeFrom) : "",
                          );
                          setDraftDeliveryTimeTo(
                            deliveryTimeTo ? snapDeliveryClockToTenMinutes(deliveryTimeTo) : "",
                          );
                          setDeliveryTimeModalOpen(true);
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-left text-sm text-admin-text transition hover:bg-admin-muted"
                        title="Задать время доставки"
                      >
                        <span className="tabular-nums">
                          {formatDeliveryClockTime(deliveryTimeFrom) ||
                            formatDeliveryClockTime(deliveryTimeTo) ? (
                            <>
                              {formatDeliveryClockTime(deliveryTimeFrom) || "—"}
                              {" – "}
                              {formatDeliveryClockTime(deliveryTimeTo) || "—"}
                            </>
                          ) : (
                            <span className="text-admin-text-secondary">Не задано</span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs text-admin-primary">Задать</span>
                      </button>
                    </div>
                  )}
                </div>

                {deliveryMethod === "minsk_courier" ? (
                  <div>
                    <div className="mb-1 text-sm text-admin-text-secondary">Время доставки</div>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftDeliveryTimeFrom(
                          deliveryTimeFrom ? snapDeliveryClockToTenMinutes(deliveryTimeFrom) : "",
                        );
                        setDraftDeliveryTimeTo(
                          deliveryTimeTo ? snapDeliveryClockToTenMinutes(deliveryTimeTo) : "",
                        );
                        setDeliveryTimeModalOpen(true);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-left text-sm text-admin-text transition hover:bg-admin-muted"
                      title="Задать время доставки"
                    >
                      <span className="tabular-nums">
                        {formatDeliveryClockTime(deliveryTimeFrom) ||
                          formatDeliveryClockTime(deliveryTimeTo) ? (
                          <>
                            {formatDeliveryClockTime(deliveryTimeFrom) || "—"}
                            {" – "}
                            {formatDeliveryClockTime(deliveryTimeTo) || "—"}
                          </>
                        ) : (
                          <span className="text-admin-text-secondary">Не задано</span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-admin-primary">Задать</span>
                    </button>
                  </div>
                ) : null}

                <label className="block text-sm text-admin-text-secondary">
                  Комментарий доставки
                  <textarea
                    value={deliveryComment}
                    onChange={(e) => setDeliveryComment(e.target.value)}
                    rows={2}
                    className={`mt-1 ${surfaceFieldClass}`}
                    placeholder="Комментарий для курьера…"
                  />
                </label>
              </>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
                  <div>
                    <div className="mb-1 text-sm text-admin-text-secondary">Дата отправки</div>
                    <AdminDatePicker value={shipmentDate} onChangeAction={setShipmentDate} />
                  </div>
                  <div>
                    <div className="mb-1 text-sm text-admin-text-secondary">Время доставки</div>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftDeliveryTimeFrom(
                          deliveryTimeFrom ? snapDeliveryClockToTenMinutes(deliveryTimeFrom) : "",
                        );
                        setDraftDeliveryTimeTo(
                          deliveryTimeTo ? snapDeliveryClockToTenMinutes(deliveryTimeTo) : "",
                        );
                        setDeliveryTimeModalOpen(true);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-left text-sm text-admin-text transition hover:bg-admin-muted"
                      title="Задать время доставки"
                    >
                      <span className="tabular-nums">
                        {formatDeliveryClockTime(deliveryTimeFrom) ||
                          formatDeliveryClockTime(deliveryTimeTo) ? (
                          <>
                            {formatDeliveryClockTime(deliveryTimeFrom) || "—"}
                            {" – "}
                            {formatDeliveryClockTime(deliveryTimeTo) || "—"}
                          </>
                        ) : (
                          <span className="text-admin-text-secondary">Не задано</span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-admin-primary">Задать</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            <AdminModalShell
              open={deliveryTimeModalOpen}
              onCloseAction={() => setDeliveryTimeModalOpen(false)}
              title="Время доставки"
              maxWidthClass="sm:max-w-md"
              footer={
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeliveryTimeModalOpen(false)}
                    className="rounded-lg border border-admin-border px-3 py-1.5 text-sm text-admin-text-secondary hover:bg-admin-muted"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryTimeFrom(
                        draftDeliveryTimeFrom.trim()
                          ? snapDeliveryClockToTenMinutes(draftDeliveryTimeFrom)
                          : "",
                      );
                      setDeliveryTimeTo(
                        draftDeliveryTimeTo.trim()
                          ? snapDeliveryClockToTenMinutes(draftDeliveryTimeTo)
                          : "",
                      );
                      setDeliveryTimeModalOpen(false);
                    }}
                    className="rounded-lg bg-admin-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                  >
                    Применить
                  </button>
                </div>
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-admin-text-secondary">
                  С
                  <div className="mt-1">
                    <AdminDeliveryTimeInput
                      value={draftDeliveryTimeFrom}
                      onChangeAction={setDraftDeliveryTimeFrom}
                    />
                  </div>
                </label>
                <label className="text-sm text-admin-text-secondary">
                  По
                  <div className="mt-1">
                    <AdminDeliveryTimeInput
                      value={draftDeliveryTimeTo}
                      onChangeAction={setDraftDeliveryTimeTo}
                    />
                  </div>
                </label>
              </div>
            </AdminModalShell>
          </div>

          <div className="flex h-full flex-col space-y-4 rounded-xl border border-admin-border bg-admin-muted/60 p-4">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-admin-text">Способ оплаты *</legend>
              <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap">
                {PAYMENT_OPTIONS.map(({ value, label }) => (
                  <label
                    key={value}
                    className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text transition hover:bg-admin-muted/70 has-[:checked]:border-admin-primary/40 has-[:checked]:bg-admin-primary/5 sm:flex-1 ${value === "card" && deliveryMethod === "belarus_courier"
                      ? "cursor-not-allowed opacity-40"
                      : ""
                      }`}
                  >
                    <input
                      type="radio"
                      name="payment_method"
                      value={value}
                      checked={paymentMethod === value}
                      disabled={value === "card" && deliveryMethod === "belarus_courier"}
                      onChange={() => setPaymentMethod(value)}
                      className="h-4 w-4 shrink-0 appearance-none rounded-full border border-admin-border bg-transparent checked:border-[5px] checked:border-admin-primary disabled:cursor-not-allowed"
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
                className={`mt-1 ${surfaceFieldClass}`}
              />
            </label>

            <div className="grid gap-4 border-t border-admin-border/80 pt-4 sm:grid-cols-2 sm:items-start">
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-admin-text">Скидочная карта</h3>
                {hasDiscountCardDisplay ? (
                  <div className="relative rounded-2xl border border-admin-border bg-admin-muted/70 p-3">
                    {!itemsLocked ? (
                      <button
                        type="button"
                        onClick={() => {
                          setDiscountCardInput("");
                          setAppliedDiscountCardNumber("");
                          setDiscountCardError("");
                          setDiscountCardManuallyCleared(true);
                        }}
                        className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-admin-text-secondary transition hover:bg-admin-surface hover:text-admin-text"
                        aria-label="Убрать карту"
                        title="Убрать карту"
                      >
                        ×
                      </button>
                    ) : null}
                    <div className={`grid grid-cols-1 gap-2 sm:grid-cols-3 ${itemsLocked ? "" : "pr-7"}`}>
                      <div className="min-w-0">
                        <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-admin-text-muted">
                          Номер карты
                        </div>
                        <div className="break-words font-mono text-[13px] font-medium text-admin-text">
                          {discountCardNumberDisplay || "—"}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-admin-text-muted">
                          % скидки
                        </div>
                        <div className="text-[13px] font-medium text-admin-text">{discountPercentDisplay}%</div>
                      </div>
                      <div className="min-w-0">
                        <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-admin-text-muted">
                          Сумма скидки
                        </div>
                        <div className="text-[13px] font-medium text-admin-text">
                          {discountAmountDisplay} руб.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : itemsLocked ? (
                  <div className="text-[13px] text-admin-text-secondary">Не применялась</div>
                ) : null}
                {!itemsLocked && !discountCardNumberDisplay ? (
                  <>
                    <div className="flex gap-2">
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
                        className={`min-w-0 flex-1 ${surfaceFieldClass}`}
                      />
                      <button
                        type="button"
                        disabled={!discountCardInput.trim() || orderQuoteLoading}
                        onClick={() => void applyDiscountCardToOrder(discountCardInput)}
                        className="h-9 shrink-0 rounded-lg border border-admin-border bg-admin-surface px-2.5 text-xs font-medium disabled:opacity-40"
                      >
                        {orderQuoteLoading ? "…" : "Ок"}
                      </button>
                    </div>
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
                    <p className="text-xs leading-relaxed text-admin-text-secondary">
                      Карта клиента подставляется автоматически. При оплате картой скидка по накопительной карте не
                      начисляется.
                    </p>
                  </>
                ) : null}
                {!itemsLocked && discountCardNumberDisplay && discountCardError ? (
                  <p className="text-xs text-red-600">{discountCardError}</p>
                ) : null}
                {!itemsLocked && discountCardNumberDisplay && orderQuoteLoading ? (
                  <p className="text-xs text-admin-text-secondary">Пересчёт скидки…</p>
                ) : null}
              </div>

              <div className="space-y-3 border-t border-admin-border/80 pt-4 sm:border-t-0 sm:pt-0">
                <h3 className="text-sm font-medium text-admin-text">Подарочный сертификат</h3>
                {itemsLocked ? (
                  <div className="rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text">
                    {initialOrder?.gift_certificate_code ? (
                      <>
                        Сертификат{" "}
                        <span className="font-mono font-medium text-admin-text">
                          {initialOrder.gift_certificate_code}
                        </span>
                        {parseQuoteMoney(initialOrder.gift_certificate_amount) > 0.004 ? (
                          <> · −{initialOrder.gift_certificate_amount} руб.</>
                        ) : (
                          <span className="text-admin-text-secondary"> · не списан</span>
                        )}
                      </>
                    ) : (
                      <span className="text-admin-text-secondary">Сертификат не применялся</span>
                    )}
                  </div>
                ) : giftCertificateConfirmed ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm">
                    <span>
                      Применён{" "}
                      <span className="font-mono font-medium text-admin-text">{appliedGiftCertificateCode}</span>
                      {hasGiftCertificateDiscount ? (
                        <span className="text-emerald-800"> · −{giftCertificateAmountStr} руб.</span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      className="rounded-lg border border-emerald-200 bg-admin-surface px-2 py-1 text-xs font-medium text-admin-text hover:bg-emerald-50"
                      onClick={() => {
                        setGiftCertificateInput("");
                        setAppliedGiftCertificateCode("");
                        setGiftCertificateError("");
                      }}
                    >
                      Убрать
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={giftCertificateInput}
                      onChange={(e) => {
                        setGiftCertificateInput(normalizeGiftCertificateCodeInput(e.target.value));
                        setGiftCertificateError("");
                        if (
                          appliedGiftCertificateCode &&
                          normalizeGiftCertificateCodeInput(e.target.value) !== appliedGiftCertificateCode
                        ) {
                          setAppliedGiftCertificateCode("");
                        }
                      }}
                      maxLength={64}
                      autoComplete="off"
                      placeholder="Код сертификата"
                      className={`min-w-0 flex-1 ${surfaceFieldClass}`}
                    />
                    <button
                      type="button"
                      disabled={!normalizeGiftCertificateCodeInput(giftCertificateInput) || orderQuoteLoading}
                      onClick={() => void applyGiftCertificateToOrder(giftCertificateInput)}
                      className="h-9 shrink-0 rounded-lg border border-admin-border bg-admin-surface px-2.5 text-xs font-medium disabled:opacity-40"
                    >
                      {orderQuoteLoading ? "…" : "Ок"}
                    </button>
                  </div>
                )}
                {giftCertificateError ? <p className="text-xs text-red-600">{giftCertificateError}</p> : null}
              </div>
            </div>
          </div>
        </div>

        <label className="block border-t border-admin-border pt-4 text-sm text-admin-text-secondary">
          Комментарий клиента
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className={`mt-1 ${surfaceFieldClass}`}
          />
        </label>

        <label className="block text-sm text-admin-text-secondary">
          Комментарий менеджера
          <span className="ml-1 text-xs font-normal text-admin-text-secondary/80">(только в админке)</span>
          <AutoGrowTextarea
            value={managerComment}
            onChange={(e) => setManagerComment(e.target.value)}
            minRows={2}
            className={`mt-1 ${surfaceFieldClass}`}
            placeholder="Внутренняя заметка для менеджеров…"
          />
        </label>
      </SectionCard>

      {isEdit && initialOrder?.gift_certificate_purchases ? (
        <CertificatesPanel
          title="Купленные подарочные сертификаты"
          wrapperClassName="space-y-2 rounded-2xl border border-violet-100 bg-violet-50/40 p-4"
          items={initialOrder.gift_certificate_purchases}
          renderItem={(row) => (
            <li key={row.id} className="rounded-lg border border-violet-100 bg-admin-surface px-3 py-2">
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
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-admin-surface px-3 py-2"
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

      <div className="overflow-hidden rounded-xl border border-admin-border bg-admin-surface shadow-admin-card">
        <div className="border-b border-admin-border bg-admin-muted/50 px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-admin-text">Итог заказа</h3>
            {orderQuoteLoading ? (
              <span className="text-[11px] text-admin-text-secondary">Пересчёт…</span>
            ) : null}
          </div>
        </div>

        <div className="space-y-1 px-4 py-2.5 text-sm leading-5">
          <div className="flex items-center justify-between gap-3 text-admin-text-secondary">
            <span>Кол-во товаров</span>
            <span className="tabular-nums text-admin-text">{orderItemsQty} шт.</span>
          </div>

          <div className="flex items-center justify-between gap-3 text-admin-text-secondary">
            <span>Сумма товаров</span>
            <span className="tabular-nums text-admin-text">{formatMoneyRub(subtotalStr)}</span>
          </div>

          <div className="flex items-center justify-between gap-3 text-admin-text-secondary">
            <span>
              Скидка по карте
              {appliedDiscountCardNumber ? (
                <>
                  {" "}
                  <span className="font-mono text-admin-text">{appliedDiscountCardNumber}</span>
                  {hasLoyaltyDiscount ? (
                    <span className="text-admin-text-secondary"> ({loyaltyPercentStr}%)</span>
                  ) : null}
                </>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums text-admin-text">
              {hasLoyaltyDiscount ? (
                <span className="font-medium text-emerald-700">−{formatMoneyRub(loyaltyDiscountStr)}</span>
              ) : appliedDiscountCardNumber && paymentMethod === "card" ? (
                <span className="text-admin-text-secondary">не действует</span>
              ) : (
                <span className="text-admin-text-secondary">—</span>
              )}
            </span>
          </div>

          {hasLoyaltyDiscount ? (
            <div className="flex items-center justify-between gap-3 text-admin-text-secondary">
              <span>Товары со скидкой</span>
              <span className="tabular-nums text-admin-text">{formatMoneyRub(merchandiseTotalStr)}</span>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 text-admin-text-secondary">
            <span>
              Сертификат
              {appliedGiftCertificateCode ? (
                <>
                  {" "}
                  <span className="font-mono text-admin-text">{appliedGiftCertificateCode}</span>
                </>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums text-admin-text">
              {hasGiftCertificateDiscount ? (
                <span className="font-medium text-emerald-700">−{formatMoneyRub(giftCertificateAmountStr)}</span>
              ) : (
                <span className="text-admin-text-secondary">—</span>
              )}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 text-admin-text-secondary">
            <span>
              Доставка
              <span className="text-admin-text-secondary/80"> · {deliveryMethodLabel}</span>
            </span>
            <span className="tabular-nums text-admin-text">
              {parseQuoteMoney(deliveryFeeStr) < 0.005 ? (
                <span className="text-emerald-700">Бесплатно</span>
              ) : (
                formatMoneyRub(deliveryFeeStr)
              )}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 text-admin-text-secondary">
            <span>Оплата</span>
            <span className="text-right text-admin-text">{paymentMethodLabel}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-admin-border bg-admin-muted/40 px-4 py-2.5">
          <span className="text-sm font-semibold text-admin-text">К оплате</span>
          <span className="text-base font-semibold tabular-nums text-admin-text">
            {formatMoneyRub(orderTotalStr)}
          </span>
        </div>
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

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving || deleting} className="rounded-lg bg-admin-primary px-5 py-2.5 text-sm text-white disabled:opacity-50">
          {saving ? (isEdit ? "Сохранение…" : "Создание…") : isEdit ? "Сохранить изменения" : "Создать заказ"}
        </button>
        <button
          type="button"
          disabled={saving || deleting}
          onClick={() => router.push("/admin/orders")}
          className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
        >
          Отмена
        </button>
        {canDeleteOrder ? (
          <button
            type="button"
            disabled={saving || deleting}
            onClick={() => setConfirmDeleteOpen(true)}
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
          >
            Удалить
          </button>
        ) : null}
      </div>

      <AdminConfirmDialog
        open={confirmDeleteOpen}
        title="Удалить заказ?"
        message="Точно удалить?"
        confirmText="Удалить"
        cancelText="Отмена"
        loading={deleting}
        confirmLoadingText="Удаление…"
        onConfirmAction={() => void handleDeleteOrder()}
        onCloseAction={() => {
          if (!deleting) setConfirmDeleteOpen(false);
        }}
      />

      <AdminConfirmDialog
        open={confirmRestoreOpen}
        title="Вернуть заказ из отменённых?"
        message="Заказ снова станет активным: резервы на складе будут выставлены заново (если применимо). Проверьте наличие товаров и скидочную карту."
        confirmText="Вернуть"
        cancelText="Отмена"
        onConfirmAction={() => {
          if (pendingRestoreStatus) {
            setOrderStatus(pendingRestoreStatus);
          }
          setPendingRestoreStatus(null);
          setConfirmRestoreOpen(false);
        }}
        onCloseAction={() => {
          setPendingRestoreStatus(null);
          setConfirmRestoreOpen(false);
        }}
      />
    </form>
  );
}

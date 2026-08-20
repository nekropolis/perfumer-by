import type {
  ProductAttributeValueData,
  ProductImageData,
  ProductVariantData,
} from "@/types/catalog";
import type { ReactNode } from "react";
import { formatMoneyDisplay } from "@/lib/format-money-display";
import { withBynSign } from "@/lib/byn-sign";
import { compareVariantsByVolume } from "@/lib/product-card-utils";
import { formatSetConcentrationDescription } from "@/lib/variant-definition-display";

/** Значение атрибута по имени (опции или custom_value). */
export function getProductAttributeDisplayValue(
  attributeValues: ProductAttributeValueData[],
  attributeName: string,
): string | null {
  const needle = attributeName.trim().toLocaleLowerCase("ru");
  const item = attributeValues.find(
    (value) => value.attribute?.name?.trim().toLocaleLowerCase("ru") === needle,
  );

  if (!item) {
    return null;
  }

  if (item.selected_options.length > 0) {
    return item.selected_options.map((option) => option.name).join(", ");
  }

  const custom = item.custom_value?.trim();
  return custom || null;
}

export function formatReviewsCountLabel(count: number): string {
  const n100 = Math.abs(count) % 100;
  const n10 = n100 % 10;
  if (n100 > 10 && n100 < 20) {
    return `${count} отзывов`;
  }
  if (n10 > 1 && n10 < 5) {
    return `${count} отзыва`;
  }
  if (n10 === 1) {
    return `${count} отзыв`;
  }
  return `${count} отзывов`;
}

export const SIMILAR_PRODUCTS_MIN_TO_SHOW = 4;
export const SIMILAR_GAP_PX = 12;

export function formatProductDetailPrice(price: string | null): ReactNode {
  if (!price) {
    return "—";
  }
  const v = formatMoneyDisplay(price);
  return v ? withBynSign(v) : "—";
}

/** Строка 1 карточки варианта: «2 мл / Пробник». */
export function formatVariantVolumeLine(variant: ProductVariantData): string {
  if (variant.is_set) {
    return formatSetVolumesLine(variant) || "Набор";
  }

  if (variant.volume == null) {
    return variant.display_name;
  }

  const unit = variant.volume_unit?.trim() || "мл";
  const volText = Number.isInteger(variant.volume)
    ? String(variant.volume)
    : String(variant.volume).replace(".", ",");

  const parts = [`${volText} ${unit}`.trim()];
  if (variant.edition?.trim()) {
    parts.push(variant.edition.trim());
  }

  return parts.join(" / ");
}

/** Строка 2 карточки варианта: описание концентрации. */
export function formatVariantConcentrationLabel(
  variant: ProductVariantData,
): string {
  if (variant.is_set) {
    const fromType = formatSetConcentrationDescription(variant.type);
    if (fromType) {
      return fromType;
    }

    const fromComponents = formatSetConcentrationDescription(
      (variant.set_components ?? [])
        .map((row) => row.concentration_label.trim())
        .filter(Boolean)
        .join("/"),
    );
    if (fromComponents) {
      return fromComponents;
    }

    return formatSetVolumesLine(variant) || "Набор";
  }

  if (variant.type?.trim()) {
    return variant.type.trim();
  }
  if (variant.concentration?.trim()) {
    return variant.concentration.trim().toUpperCase();
  }
  return "—";
}

/** Для карточки набора: «12 мл / 3 мл». */
function formatSetVolumesLine(variant: ProductVariantData): string {
  const fromComponents = (variant.set_components ?? [])
    .map((row) => formatSetComponentVolume(row.volume_label))
    .filter(Boolean);
  if (fromComponents.length > 0) {
    return fromComponents.join(" / ");
  }

  const label = variant.volume_label?.trim() || "";
  if (!label) {
    return "";
  }

  return label
    .split("/")
    .map((part) => formatSetComponentVolume(part))
    .filter(Boolean)
    .join(" / ");
}

/** Строки состава набора для блока «Выбранный вариант»: «12 мл / парфюмерная вода». */
export function formatSetComponentLines(variant: ProductVariantData): string[] {
  const components = variant.set_components ?? [];
  if (components.length === 0) {
    return [];
  }

  return components.map((row) => {
    const volume = formatSetComponentVolume(row.volume_label);
    const concentration = row.concentration_label.trim();
    if (volume && concentration) {
      return `${volume} / ${concentration}`;
    }
    return volume || concentration || "—";
  });
}

function formatSetComponentVolume(volumeLabel: string): string {
  const raw = volumeLabel.trim();
  if (!raw) {
    return "";
  }

  const withoutUnit = raw.replace(/\s*(мл|ml)\s*/gi, "").trim();
  if (!withoutUnit) {
    return "";
  }

  return `${withoutUnit} мл`;
}

export type VariantAvailabilityState = {
  text: string;
  className: string;
};

export function getVariantAvailabilityState(
  variant: ProductVariantData,
  isProductOutOfStock: boolean,
): VariantAvailabilityState {
  if (!variant.is_available) {
    return { text: "Нет", className: "text-red-600" };
  }
  if (variant.is_preorder) {
    return { text: "Предзаказ", className: "text-amber-600" };
  }
  if (variant.availability_source === "supplier_only") {
    return { text: "Доступен", className: "text-sky-700" };
  }
  if (isProductOutOfStock) {
    return { text: "Под заказ", className: "text-sky-700" };
  }
  return { text: "В наличии", className: "text-emerald-600" };
}

export function normalizeProductImages(value: unknown): ProductImageData[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is ProductImageData =>
      Boolean(item && typeof item === "object"),
    );
  }

  if (value && typeof value === "object") {
    return Object.values(value).filter((item): item is ProductImageData =>
      Boolean(item && typeof item === "object"),
    );
  }

  return [];
}

export function normalizeProductVariants(value: unknown): ProductVariantData[] {
  const normalizeList = (items: unknown[]): ProductVariantData[] => {
    const byId = new Map<number, ProductVariantData>();
    for (const raw of items) {
      if (!raw || typeof raw !== "object") {
        continue;
      }
      const candidate = raw as Partial<ProductVariantData>;
      const id = Number(candidate.id);
      if (!Number.isFinite(id) || id <= 0) {
        continue;
      }
      byId.set(id, { ...candidate, id } as ProductVariantData);
    }
    return Array.from(byId.values()).sort(compareVariantsByVolume);
  };

  if (Array.isArray(value)) {
    return normalizeList(value);
  }

  if (value && typeof value === "object") {
    return normalizeList(Object.values(value));
  }

  return [];
}

export function similarVisibleColumns(): 2 | 3 | 4 {
  if (typeof window === "undefined") {
    return 2;
  }
  if (window.matchMedia("(min-width: 1280px)").matches) {
    return 4;
  }
  if (window.matchMedia("(min-width: 768px)").matches) {
    return 3;
  }
  return 2;
}

/** База URL кабинета Ветер для ссылки на заявку /Order/{shipment_id}. */
export const VETER_ORDER_BASE_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_VETER_ORDER_BASE_URL?.trim()) ||
  "https://xn--b1aga8bi.xn--90ais";

export function veterOrderUrl(shipmentId: string): string {
  const id = shipmentId.trim();
  return `${VETER_ORDER_BASE_URL.replace(/\/$/, "")}/Order/${encodeURIComponent(id)}`;
}

export function isVeterInTransitStatus(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLocaleLowerCase("ru-RU") === "в пути";
}

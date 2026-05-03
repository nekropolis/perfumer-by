import type { ReviewItem } from "@/types/reviews";

/** Одинаково на SSR и в браузере — иначе `Intl` без timeZone даёт разный календарный день (UTC vs локаль пользователя). */
const REVIEW_DATE_TIME_ZONE = process.env.NEXT_PUBLIC_SITE_TIMEZONE?.trim() || "Europe/Minsk";

/** CRLF, одиночные `\r`, а также буквальные в строке `\r\n` / `\n` из API. */
export function normalizeReviewTextForDisplay(text: string): string {
  return text
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

export function normalizeReviewItem(item: ReviewItem): ReviewItem {
  const reply = item.reply?.text
    ? { ...item.reply, text: normalizeReviewTextForDisplay(item.reply.text) }
    : item.reply;
  return {
    ...item,
    text: normalizeReviewTextForDisplay(item.text),
    reply,
  };
}

export function formatReviewDateRu(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: REVIEW_DATE_TIME_ZONE,
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

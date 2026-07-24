/** Префиксы улиц Ветер (StreetPrefix / SenderStreetPrefix). */
export const VETER_STREET_PREFIXES = [
  "ул.",
  "аллея",
  "бул.",
  "дор.",
  "линия",
  "маг.",
  "мик-н",
  "наб.",
  "пер.",
  "пл.",
  "пр.",
  "пр-кт",
  "ряд",
  "тракт",
  "туп.",
  "ш.",
] as const;

export type VeterStreetPrefix = (typeof VETER_STREET_PREFIXES)[number];

export const DEFAULT_VETER_STREET_PREFIX: VeterStreetPrefix = "ул.";

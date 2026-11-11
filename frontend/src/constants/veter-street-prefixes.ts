/** Префиксы улиц Ветер (StreetPrefix / SenderStreetPrefix). */
export const VETER_STREET_PREFIXES = [
  "ул.",
  "пр-кт",
  "пер.",
  "тракт",
  "аллея",
  "бул.",
  "дор.",
  "линия",
  "маг.",
  "мик-н",
  "наб.",
  "пл.",
  "пр.",
  "ряд",
  "туп.",
  "ш.",
] as const;

export type VeterStreetPrefix = (typeof VETER_STREET_PREFIXES)[number];

export const DEFAULT_VETER_STREET_PREFIX: VeterStreetPrefix = "ул.";

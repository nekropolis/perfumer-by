/** Строка адреса доставки: префикс, улица, дом, корпус, квартира. */
export function formatDeliveryAddressLine({
    prefix,
    street,
    house,
    korpus,
    apartment,
}: {
    prefix?: string | null;
    street?: string | null;
    house?: string | null;
    korpus?: string | null;
    apartment?: string | null;
}): string {
    const streetName = street?.trim() || "";
    const streetPrefix = prefix?.trim() || "";
    const houseNo = house?.trim() || "";
    const korpusNo = korpus?.trim() || "";
    const aptNo = apartment?.trim() || "";

    const streetPart = [streetPrefix, streetName].filter(Boolean).join(" ").trim();
    const parts: string[] = [];
    if (streetPart) {
        parts.push(streetPart);
    }
    if (houseNo) {
        parts.push(`д. ${houseNo}`);
    }
    if (korpusNo) {
        parts.push(`корп. ${korpusNo}`);
    }
    if (aptNo) {
        parts.push(`кв. ${aptNo}`);
    }

    return parts.join(", ");
}

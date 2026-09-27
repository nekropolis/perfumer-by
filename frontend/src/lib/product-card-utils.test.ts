import { describe, expect, it } from "vitest";
import { uniqueVariantChipLabels } from "./product-card-utils";

describe("uniqueVariantChipLabels", () => {
    it("keeps one chip when the same volume is a regular bottle and a tester", () => {
        expect(
            uniqueVariantChipLabels(["30 мл", "50 мл", "100 мл", "100 мл / Тестер"]),
        ).toEqual(["30", "50", "100"]);
    });

    it("keeps distinct volumes and non-volume labels", () => {
        expect(uniqueVariantChipLabels(["75 мл", "Набор"])).toEqual(["75", "Набор"]);
    });
});

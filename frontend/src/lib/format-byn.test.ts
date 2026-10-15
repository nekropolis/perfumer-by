import { describe, expect, it } from "vitest";
import {
    addMoneyStrings,
    formatMoneyMinorUnits,
    parseMoneyMinorUnits,
    subtractMoneyStrings,
} from "./format-byn";

describe("parseMoneyMinorUnits", () => {
    it("subtracts decimal strings in minor units", () => {
        expect(subtractMoneyStrings("10.10", "3.05")).toBe("7.05");
    });

    it("adds 0.1 and 0.2 without binary float error", () => {
        expect(addMoneyStrings("0.1", "0.2")).toBe("0.30");
    });

    it("accepts a comma decimal separator", () => {
        expect(parseMoneyMinorUnits("12,50")).toBe(1250);
        expect(formatMoneyMinorUnits(parseMoneyMinorUnits("12,50"))).toBe("12.50");
    });

    it("falls back to zero for empty and invalid values", () => {
        expect(parseMoneyMinorUnits("")).toBe(0);
        expect(parseMoneyMinorUnits("   ")).toBe(0);
        expect(parseMoneyMinorUnits("abc")).toBe(0);
        expect(parseMoneyMinorUnits(null)).toBe(0);
        expect(formatMoneyMinorUnits(0)).toBe("0.00");
    });
});

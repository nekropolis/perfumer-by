import { describe, expect, it } from "vitest";
import {
    formatBatchCodeDateLabel,
    formatBatchCodePeriod,
    joinBatchCodeCandidates,
} from "./batch-code-dates";

describe("joinBatchCodeCandidates", () => {
    it("joins two possible dates with «или» instead of a range", () => {
        expect(joinBatchCodeCandidates(["январь 1998", "январь 2018"])).toBe(
            "январь 1998 или январь 2018",
        );
    });

    it("keeps commas for a long candidate list", () => {
        expect(joinBatchCodeCandidates(["1991", "2001", "2011", "2021"])).toBe(
            "1991, 2001, 2011 или 2021",
        );
    });

    it("returns a single label as is", () => {
        expect(joinBatchCodeCandidates(["июнь 2010"])).toBe("июнь 2010");
        expect(joinBatchCodeCandidates([])).toBe("");
    });
});

describe("formatBatchCodePeriod", () => {
    it("shows a single month without a range", () => {
        expect(
            formatBatchCodePeriod({ date_from: "2010-06", date_to: "2010-06", precision: "month" }),
        ).toBe("июнь 2010");
    });

    it("uses a dash instead of «с … по …» with a nominative month", () => {
        expect(
            formatBatchCodePeriod({ date_from: "2008-01", date_to: "2018-12", precision: "year" }),
        ).toBe("2008 — 2018");
    });
});

describe("formatBatchCodeDateLabel", () => {
    it("renders a year for year precision", () => {
        expect(formatBatchCodeDateLabel("2015", "year")).toBe("2015");
        expect(formatBatchCodeDateLabel("2015-03", "year")).toBe("2015");
    });
});

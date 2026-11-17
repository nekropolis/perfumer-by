import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BatchCodeResultPanel } from "./batch-code-check-form";
import type { BatchCodeCheckData } from "@/types/batch-code";

const base: BatchCodeCheckData = {
    status: "approximate",
    brand: { slug: "dior", name: "Dior" },
    code_normalized: "8A01",
    result: {
        date_from: "1998-01",
        date_to: "2018-01",
        precision: "month",
        candidates: ["1998-01", "2018-01"],
    },
    confidence: "medium",
    period_note: null,
    official_url: null,
    rule_id: "lvmh-dior",
    sources: ["https://example.org/rule"],
};

describe("BatchCodeResultPanel", () => {
    it("renders several candidates as alternatives, not as a range", () => {
        const html = renderToStaticMarkup(<BatchCodeResultPanel data={base} codeRaw="8A01" />);

        expect(html).toContain("Возможные варианты");
        expect(html).toContain("январь 1998 или январь 2018");
        expect(html).not.toContain("январь 1998 — январь 2018");
        expect(html).not.toContain("с январь");
    });

    it("renders a single date without alternatives", () => {
        const data: BatchCodeCheckData = {
            ...base,
            code_normalized: "0T02",
            result: {
                date_from: "2010-06",
                date_to: "2010-06",
                precision: "month",
                candidates: ["2010-06"],
            },
        };
        const html = renderToStaticMarkup(<BatchCodeResultPanel data={data} codeRaw="0T02" />);

        expect(html).toContain("Ориентировочно");
        expect(html).toContain("июнь 2010");
        expect(html).not.toContain("Возможные варианты");
    });

    it("adds the external check link when the format is recognized but the date is unknown", () => {
        const data: BatchCodeCheckData = {
            ...base,
            status: "format_recognized",
            code_normalized: "8301",
            result: null,
            confidence: "low",
        };
        const html = renderToStaticMarkup(<BatchCodeResultPanel data={data} codeRaw="8301" />);

        expect(html).toContain("Формат кода распознан");
        expect(html).toContain('href="https://www.checkfresh.com/?lang=ru"');
        expect(html).toContain('rel="nofollow noopener noreferrer"');
    });

    it("adds the external check link when the code cannot be parsed", () => {
        const data: BatchCodeCheckData = {
            ...base,
            status: "invalid_format",
            code_normalized: "???",
            result: null,
            confidence: null,
            sources: [],
        };
        const html = renderToStaticMarkup(<BatchCodeResultPanel data={data} codeRaw="???" />);

        expect(html).toContain("Не удалось разобрать код");
        expect(html).toContain('href="https://www.checkfresh.com/?lang=ru"');
    });
});

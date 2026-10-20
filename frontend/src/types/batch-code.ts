export type BatchCodeBrandSupport = "approximate" | "format_recognized" | "manufacturer_portal";

export type BatchCodeCheckStatus =
    | BatchCodeBrandSupport
    | "not_supported"
    | "invalid_format";

export type BatchCodeBrand = {
    slug: string;
    name: string;
    support: BatchCodeBrandSupport;
};

export type BatchCodeBrandsResponse = {
    data: BatchCodeBrand[];
};

export type BatchCodeResultPrecision = "year" | "month" | null;

export type BatchCodeConfidence = "low" | "medium" | null;

export type BatchCodeCheckResult = {
    date_from: string | null;
    date_to: string | null;
    precision: BatchCodeResultPrecision;
    candidates: string[];
};

export type BatchCodeCheckData = {
    status: BatchCodeCheckStatus;
    brand: { slug: string; name: string } | null;
    code_normalized: string;
    result: BatchCodeCheckResult | null;
    confidence: BatchCodeConfidence;
    period_note: string | null;
    official_url: string | null;
    rule_id: string | null;
    sources: string[];
};

export type BatchCodeCheckResponse = {
    data: BatchCodeCheckData;
};

export type BatchCodeDateKind = "production" | "expiry";

export type BatchCodeSubmissionInput = {
    brand_slug: string;
    code: string;
    printed_date: string;
    date_kind: BatchCodeDateKind;
    consent: true;
    email?: string;
};

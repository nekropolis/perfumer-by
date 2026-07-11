import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

type RevalidateBody = {
    tags?: string[];
};

export async function POST(request: NextRequest): Promise<NextResponse> {
    const secret = process.env.CATALOG_REVALIDATE_SECRET ?? "";
    const headerSecret = request.headers.get("x-revalidate-secret") ?? "";

    if (secret === "" || headerSecret !== secret) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let body: RevalidateBody = {};
    try {
        body = (await request.json()) as RevalidateBody;
    } catch {
        body = {};
    }

    const tags = Array.isArray(body.tags) && body.tags.length > 0 ? body.tags : ["catalog"];

    for (const tag of tags) {
        revalidateTag(tag);
    }

    return NextResponse.json({
        revalidated: true,
        tags,
        now: Date.now(),
    });
}

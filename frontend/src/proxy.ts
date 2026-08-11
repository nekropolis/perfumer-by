import { NextRequest, NextResponse } from "next/server";
import { getApiBase } from "@/lib/api";

type SeoRedirectResponse = {
    data: {
        to_path: string | null;
        http_code: 301 | 302 | 410;
    } | null;
};

function decodePathname(pathname: string): string {
    try {
        return decodeURIComponent(pathname);
    } catch {
        return pathname;
    }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
    try {
        const response = await fetch(`${getApiBase()}/seo-redirects/resolve`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ path: decodePathname(request.nextUrl.pathname) }),
            cache: "no-store",
        });

        if (!response.ok) {
            return NextResponse.next();
        }

        const { data } = (await response.json()) as SeoRedirectResponse;
        if (!data) {
            return NextResponse.next();
        }

        if (data.http_code === 410) {
            return new NextResponse(null, { status: 410 });
        }

        if (!data.to_path || (data.http_code !== 301 && data.http_code !== 302)) {
            return NextResponse.next();
        }

        const destination = new URL(data.to_path, request.url);
        if (!destination.search && request.nextUrl.search) {
            destination.search = request.nextUrl.search;
        }

        return NextResponse.redirect(destination, data.http_code);
    } catch {
        return NextResponse.next();
    }
}

export const config = {
    matcher: ["/((?!api|admin|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};

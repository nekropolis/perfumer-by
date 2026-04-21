import type { NextConfig } from "next";

const allowedDevOrigins = (
    process.env.NEXT_ALLOWED_DEV_ORIGINS || "localhost,127.0.0.1"
)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

function buildRemoteImagePatterns() {
    const patterns: Array<{
        protocol: "http" | "https";
        hostname: string;
        port?: string;
        pathname: string;
    }> = [];

    const seen = new Set<string>();
    const addPattern = (protocol: "http" | "https", hostname: string, port = "") => {
        const key = `${protocol}|${hostname}|${port}`;
        if (!hostname || seen.has(key)) {
            return;
        }
        seen.add(key);
        patterns.push({
            protocol,
            hostname,
            ...(port ? { port } : {}),
            pathname: "/storage/**",
        });
    };

    for (const host of allowedDevOrigins) {
        const [hostname, port = ""] = host.split(":");
        addPattern("http", hostname, port);
        addPattern("https", hostname, port);
    }

    const apiBase = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (apiBase) {
        try {
            const parsed = new URL(apiBase);
            addPattern(
                parsed.protocol === "https:" ? "https" : "http",
                parsed.hostname,
                parsed.port
            );
        } catch {
            // ignore invalid NEXT_PUBLIC_API_URL during local setup
        }
    }

    return patterns;
}

const nextConfig: NextConfig = {
    allowedDevOrigins,
    images: {
        remotePatterns: buildRemoteImagePatterns(),
    },
};

export default nextConfig;
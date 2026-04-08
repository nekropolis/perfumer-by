import type { NextConfig } from "next";

const allowedDevOrigins = (
    process.env.NEXT_ALLOWED_DEV_ORIGINS || "localhost,127.0.0.1"
)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const nextConfig: NextConfig = {
    allowedDevOrigins,
};

export default nextConfig;
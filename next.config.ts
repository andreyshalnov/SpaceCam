import type { NextConfig } from "next";

const isExport = process.env.NEXT_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  ...(isExport ? { output: "export" as const, basePath } : { output: "standalone" as const }),
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,
};

export default nextConfig;

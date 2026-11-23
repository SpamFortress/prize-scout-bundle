import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.PRIZE_SCOUT_DIST_DIR || ".next",
  typescript: {
    tsconfigPath: process.env.PRIZE_SCOUT_TSCONFIG || "tsconfig.json",
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Set output file tracing root to workspace root for Docker monorepo builds
  outputFileTracingRoot: process.env.OUTPUT_TRACING_ROOT,
};

export default nextConfig;

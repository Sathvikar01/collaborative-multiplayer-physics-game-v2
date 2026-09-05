import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SSE streams must not be buffered by gzip
  compress: false,
  // Do not let an unrelated lockfile in a parent directory change tracing or
  // Turbopack's workspace root during local builds.
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;

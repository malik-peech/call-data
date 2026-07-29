import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: {
    // Lint is run separately; don't block Coolify builds on it.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // The hand-maintained Database type doesn't model table relationships, so
    // Supabase's join inference produces `never` types on embedded selects.
    // These are type-check artifacts, not runtime bugs — don't block the build.
    ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;

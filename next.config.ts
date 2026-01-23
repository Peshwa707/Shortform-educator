import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for unpdf package to work properly in server components
  serverExternalPackages: ['unpdf'],
};

export default nextConfig;

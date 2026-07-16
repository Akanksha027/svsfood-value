import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow document uploads up to the vault 15 MB limit (+ small overhead).
  experimental: {
    serverActions: {
      bodySizeLimit: "16mb",
    },
    proxyClientMaxBodySize: "16mb",
  },
};

export default nextConfig;

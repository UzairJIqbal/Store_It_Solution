import type { NextConfig } from "next";

// node-appwrite 17 can't make requests on Node 26+ ("invalid onError method"), so fail fast with a clear message
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor !== 24) {
  throw new Error(
    `StoreIt needs Node 24 (see .nvmrc), but this is Node ${process.versions.node}. ` +
    `On macOS with Homebrew: export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`
  );
}

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.freepik.com'
      },
      {
        protocol: 'https',
        hostname: 'fra.cloud.appwrite.io'
      },

    ]
  }
};

export default nextConfig;

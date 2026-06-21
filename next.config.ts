import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // bcrypt = module natif : ne pas le bundler, le résoudre au runtime (Node).
  serverExternalPackages: ["bcrypt"],
};

export default nextConfig;

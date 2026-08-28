import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the workspace root explicitly — otherwise Next.js gets confused by an
  // unrelated package-lock.json living further up the user's home directory.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;

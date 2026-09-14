import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // this repo lives inside the Hackathons workspace which has other lockfiles;
  // pin the root so Turbopack never infers the parent directory
  turbopack: {
    root: path.join(import.meta.dirname),
  },
};

export default nextConfig;

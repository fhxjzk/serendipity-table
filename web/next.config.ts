import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Every page depends on the signed-in user, so render dynamically.
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

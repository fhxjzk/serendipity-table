import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Every page depends on the signed-in user, so render dynamically.
  cacheComponents: false,
  partialPrefetching: false,
  // The floating "N" badge in development covers the app during local demos; errors still show.
  devIndicators: false,
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

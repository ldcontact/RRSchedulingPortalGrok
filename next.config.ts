import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // nodemailer uses Node APIs; keep it out of the bundled graph
  serverExternalPackages: ["nodemailer", "google-auth-library"],
  // photo uploads go through server actions (already resized client-side to ~300-600 KB each)
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }, { protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
};

export default nextConfig;

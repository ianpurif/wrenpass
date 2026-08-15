import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: process.env.CLOUDINARY_CLOUD_NAME
      ? [
          {
            protocol: "https",
            hostname: "res.cloudinary.com",
            port: "",
            pathname: `/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/**`,
            search: "",
          },
        ]
      : [],
  },
  reactStrictMode: true,
};

const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN)
  && (process.env.VERCEL === "1" || process.env.CI === "true");

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: uploadSourceMaps ? process.env.SENTRY_AUTH_TOKEN : undefined,
  silent: !uploadSourceMaps,
  telemetry: false,
  widenClientFileUpload: true,
  sourcemaps: { disable: !uploadSourceMaps },
  webpack: {
    automaticVercelMonitors: true,
    treeshake: { removeDebugLogging: true },
  },
});

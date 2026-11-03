/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // "Personal mails" became "Customize mail"; keep old links working.
  async redirects() {
    return [
      { source: "/marketing/personal", destination: "/marketing/customize", permanent: true },
      { source: "/marketing/personal/:path*", destination: "/marketing/customize/:path*", permanent: true },
      // Conversions moved out of Analytics into its own section.
      { source: "/marketing/analytics/conversions", destination: "/marketing/conversions/klymb-actions", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

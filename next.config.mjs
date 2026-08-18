import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
    formats: ["image/webp", "image/avif"],
  },
  /**
   * Security headers. None were set, which left three things open that cost
   * nothing to close: the site could be framed by anyone (clickjacking), the
   * browser was free to sniff a response's type rather than trust it, and the
   * full URL leaked to every third party in a Referer header.
   *
   * No Content-Security-Policy yet. A CSP is worth having and is not a
   * one-liner — Next injects inline scripts, so it needs nonces threaded
   * through, and a wrong one silently breaks the app in production. Better
   * absent and known than present and mis-set.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            // Nothing here uses a camera, a microphone or location.
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            // Only meaningful over HTTPS; harmless locally.
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        // /become-an-owner was the original path. The page is now
        // /list-your-car so the URL matches the label used in the nav, the
        // footer and how-it-works. Permanent so search engines follow it.
        source: "/become-an-owner",
        destination: "/list-your-car",
        permanent: true,
      },
    ];
  },
  compress: true,
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);

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

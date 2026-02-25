/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    trustHostHeader: true,
  },
  async rewrites() {
    return {
      // fallback runs AFTER all Next.js routes (static + dynamic) — so /api/auth/[...nextauth]
      // is handled by Next.js first; only unmatched /api/* falls through to the orchestrator
      fallback: [
        {
          source: '/api/:path*',
          destination: 'http://localhost:4001/api/:path*',
        },
        {
          source: '/trigger/:path*',
          destination: 'http://localhost:4001/trigger/:path*',
        },
        {
          source: '/webhook/:path*',
          destination: 'http://localhost:4001/webhook/:path*',
        },
      ],
    };
  },
}

module.exports = nextConfig

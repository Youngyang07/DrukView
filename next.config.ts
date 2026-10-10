import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['pg'],
  // data/manual CSVs are read with fs at runtime by the manual job, so they must be bundled into the serverless function
  outputFileTracingIncludes: { '/api/cron/[job]': ['./data/manual/*.csv'] },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }];
  },
};
export default config;

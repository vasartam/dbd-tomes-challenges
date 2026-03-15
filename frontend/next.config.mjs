/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: 'http://127.0.0.1:5001/api/:path*' }]
  },
  // Polling для корректной работы hot reload в WSL при файлах на Windows-диске
  watchOptions: {
    pollIntervalMs: 300,
  },
}
export default nextConfig

/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production'

const nextConfig = {
  // В production создаём standalone-сборку для Docker (минимальный размер образа)
  output: isProd ? 'standalone' : undefined,

  async rewrites() {
    // В dev-режиме проксируем /api на локальный Flask
    // В production проксирование делает Nginx — этот блок не задействован
    if (isProd) return []
    return [{ source: '/api/:path*', destination: 'http://127.0.0.1:5001/api/:path*' }]
  },

  // Polling для корректной работы hot reload в WSL при файлах на Windows-диске
  watchOptions: {
    pollIntervalMs: 300,
  },
}
export default nextConfig

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['twilio'],
  },
  images: {
    remotePatterns: [],
  },
}

module.exports = nextConfig

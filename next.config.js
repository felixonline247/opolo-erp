/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This tells Next.js to ignore the 'app' directory if it accidentally finds one
  useFileSystemPublicRoutes: true, 
}

module.exports = nextConfig
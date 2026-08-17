/** @type {import('next').NextConfig} */
const apiProxyTarget =
  process.env.API_PROXY_TARGET || "http://127.0.0.1:4101";

const nextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
      {
        source: "/healthz",
        destination: `${apiProxyTarget}/healthz`,
      },
      {
        source: "/readyz",
        destination: `${apiProxyTarget}/readyz`,
      },
    ];
  },
};

export default nextConfig;

/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "export",
  pageExtensions: ["tsx"],
  transpilePackages: ["@kabehub/shared"],
};

module.exports = nextConfig;

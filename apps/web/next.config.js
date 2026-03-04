/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ['@meet-pipeline/shared'],
    experimental: {
        serverComponentsExternalPackages: ['pdf-parse'],
    },
};

module.exports = nextConfig;

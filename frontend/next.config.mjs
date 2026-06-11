/** @type {import('next').NextConfig} */
const config = {
  // Allow importing config/testnet.json from outside the frontend directory
  // so there is a single source of truth for contract addresses.
  experimental: {
    externalDir: true,
  },
};

export default config;

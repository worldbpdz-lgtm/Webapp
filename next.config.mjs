import { fileURLToPath } from "url";
import { dirname } from "path";

/** @type {import('next').NextConfig} */
const __dirname = dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
// prisma.config.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); // <-- loads your DATABASE_URL from .env.local
dotenv.config(); // optional fallback to .env if you ever use it

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
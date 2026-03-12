// src/lib/prisma.ts
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function makeClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL");

  const adapter = new PrismaPg({
    connectionString,

    // ✅ If your network/antivirus injects a self-signed cert, this prevents failing.
    ssl: { rejectUnauthorized: false },

    // ✅ keep it tiny; you're already behind Supabase pooler
    max: 3,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
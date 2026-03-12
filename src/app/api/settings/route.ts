// src/app/api/settings/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ThemePref = "system" | "light" | "dark";
type Accent = "sunset" | "amber" | "coral" | "mint" | "indigo";
type Density = "comfortable" | "compact";
type Motion = "full" | "reduced";

function defaults(shopId: string) {
  return {
    shopId,
    workspaceName: "WBP Dashboard",
    appearance: {
      theme: "system" as ThemePref,
      accent: "sunset" as Accent,
      density: "comfortable" as Density,
      motion: "full" as Motion,
    },
    navigation: {
      orders: true,
      reviews: true,
      analytics: true,
      team: true,
      trash: true,
      settings: true,
    },
    notifications: {
      newOrder: true,
      newReview: false,
      dailyDigest: false,
    },
    security: {
      require2fa: false,
      sessionTimeoutMins: 240,
    },
  };
}

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const shopIdParam = url.searchParams.get("shopId");

  const shop =
    (shopIdParam
      ? await prisma.shop.findUnique({ where: { id: shopIdParam }, select: { id: true } })
      : await prisma.shop.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } })) ?? null;

  if (!shop) return NextResponse.json({ error: "No shop found" }, { status: 404 });

  const row = await prisma.dashboardSettings.findUnique({ where: { shopId: shop.id } });
  return NextResponse.json({ settings: row ?? defaults(shop.id) });
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const shopIdParam = url.searchParams.get("shopId");

  const shop =
    (shopIdParam
      ? await prisma.shop.findUnique({ where: { id: shopIdParam }, select: { id: true } })
      : await prisma.shop.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } })) ?? null;

  if (!shop) return NextResponse.json({ error: "No shop found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const payload = {
    workspaceName: String((body as any).workspaceName ?? "WBP Dashboard"),
    appearance: (body as any).appearance ?? defaults(shop.id).appearance,
    navigation: (body as any).navigation ?? defaults(shop.id).navigation,
    notifications: (body as any).notifications ?? defaults(shop.id).notifications,
    security: (body as any).security ?? defaults(shop.id).security,
  };

  const saved = await prisma.dashboardSettings.upsert({
    where: { shopId: shop.id },
    create: { shopId: shop.id, ...payload },
    update: payload,
  });

  return NextResponse.json({ ok: true, settings: saved });
}
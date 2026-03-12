// src/app/app/settings/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { supabaseServer } from "@/lib/supabase/server";
import SettingsWorkspace from "./settings-workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SettingsPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const shops = await prisma.shop.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, shopDomain: true, createdAt: true },
  });

  const activeShop = shops[0];
  if (!activeShop) redirect("/app/orders/review");

  const row = await prisma.dashboardSettings.findUnique({ where: { shopId: activeShop.id } });

  const initial =
    row ?? ({
      shopId: activeShop.id,
      workspaceName: "WBP Dashboard",
      appearance: { theme: "system", accent: "sunset", density: "comfortable", motion: "full" },
      navigation: { orders: true, reviews: true, analytics: true, team: true, trash: true, settings: true },
      notifications: { newOrder: true, newReview: false, dailyDigest: false },
      security: { require2fa: false, sessionTimeoutMins: 240 },
    } as const);

  return <SettingsWorkspace shops={shops} activeShopId={activeShop.id} initial={initial as any} />;
}
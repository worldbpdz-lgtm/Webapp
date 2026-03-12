// src/app/app/analytics/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { supabaseServer } from "@/lib/supabase/server";
import AnalyticsWorkspace from "./analytics-workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  // Same strategy as Orders: pick latest shop in DB
  const shop = await prisma.shop.findFirst({
    orderBy: { createdAt: "desc" },
    include: { ShopSettings: true },
  });

  if (!shop) {
    return (
      <div className="wbp-surface wbp-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 950 }}>No shop found</div>
        <div className="orders-muted" style={{ marginTop: 6 }}>
          Seed / install the app first so a Shop row exists.
        </div>
      </div>
    );
  }

  const sp = searchParams || {};
  const range = typeof sp.range === "string" ? sp.range : "30d";
  const start = typeof sp.start === "string" ? sp.start : "";
  const end = typeof sp.end === "string" ? sp.end : "";

  return (
    <AnalyticsWorkspace
      shopId={shop.id}
      shopDomain={shop.shopDomain}
      timezone={shop.timezone || "UTC"}
      currency={shop.ShopSettings?.currency || "DZD"}
      initialRange={range}
      initialStart={start}
      initialEnd={end}
    />
  );
}
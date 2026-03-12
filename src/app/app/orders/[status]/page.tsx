// src/app/app/orders/[status]/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import OrdersWorkspace from "../orders-workspace";

export const dynamic = "force-dynamic";

type LaneId = "review" | "confirmed" | "declined";

type CardStatus =
  | "received"
  | "in_review"
  | "contacted"
  | "confirmed"
  | "cancelled"
  | "spam"
  | "archived";

type Card = {
  id: string;
  status: CardStatus;
  name: string;
  roleType: string;
  productId: string | null;
  productTitle: string | null;
  qty: number | null;
  wilaya: string | null;
  createdAt: string;
};

function normalizeRoute(status: string): LaneId {
  if (status === "confirmed") return "confirmed";
  if (status === "declined") return "declined";
  return "review";
}

function pickProductTitle(values: unknown): string | null {
  const v = values as any;
  return (
    v?.productTitle ??
    v?.product?.title ??
    v?.product_name ??
    v?.productName ??
    v?.title ??
    null
  );
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function computeRange(range: string) {
  const now = new Date();
  const r = (range || "").trim();

  if (r === "today") {
    const start = startOfDay(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  if (r === "7d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { start, end: now };
  }
  if (r === "30d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return { start, end: now };
  }
  if (r === "6m") {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 6);
    return { start, end: now };
  }

  // "all"
  return { start: null as Date | null, end: null as Date | null };
}

export default async function OrdersStatusPage({
  params,
  searchParams,
}: {
  params: { status: string };
  searchParams: Promise<{ range?: string }>;
}) {
  const activeRoute = normalizeRoute(params.status);

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const shop = await prisma.shop.findFirst({
    select: { id: true, shopDomain: true },
    orderBy: { createdAt: "desc" },
  });

  if (!shop) {
    return (
      <main className="p-6">
        <div className="wbp-page-head">
          <div>
            <h1>Orders</h1>
            <div className="wbp-muted">No Shop found in database yet.</div>
          </div>
        </div>
        <div className="mt-6 wbp-glass p-4">Add a shop record, then refresh.</div>
      </main>
    );
  }

  const sp = (await searchParams) ?? {};
  const range = String(sp.range ?? "all").trim();
  const { start, end } = computeRange(range);

  const rows = await prisma.request.findMany({
    where: {
      shopId: shop.id,
      status: { notIn: ["archived", "spam"] },
      ...(start && end ? { createdAt: { gte: start, lt: end } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      status: true,
      roleType: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      createdAt: true,
      values: true,
      productId: true,
      qty: true,
      GeoWilaya: { select: { nameFr: true, nameAr: true } },
      RequestItem: { take: 50, select: { productId: true, qty: true } },
    },
  });

  const cards: Card[] = rows.map((r) => {
    const name =
      `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() ||
      r.email ||
      r.phone ||
      "Customer";

    const wilaya = r.GeoWilaya?.nameFr ?? r.GeoWilaya?.nameAr ?? null;
    const items = r.RequestItem ?? [];

    // ✅ FIX QTY: if items exist, ALWAYS trust items sum (multi-product flow)
    const itemsSum =
      items.length > 0
        ? items.reduce((s, it) => s + (typeof it.qty === "number" ? it.qty : 1), 0)
        : null;

    const totalQty =
      items.length > 0
        ? itemsSum
        : typeof r.qty === "number" && r.qty > 0
          ? r.qty
          : null;

    const productId = items[0]?.productId ?? r.productId ?? null;
    const productTitle = pickProductTitle(r.values);

    return {
      id: r.id,
      status: r.status as CardStatus,
      name,
      roleType: String(r.roleType),
      productId,
      productTitle,
      qty: typeof totalQty === "number" && totalQty > 0 ? totalQty : null,
      wilaya,
      createdAt: r.createdAt.toISOString(),
    };
  });

  const counts = { review: 0, confirmed: 0, declined: 0 } as Record<LaneId, number>;
  for (const c of cards) {
    if (c.status === "confirmed") counts.confirmed += 1;
    else if (c.status === "cancelled") counts.declined += 1;
    else counts.review += 1;
  }

  return (
    <main className="p-6">
      <div className="wbp-page-head">
        <div>
          <h1>Orders</h1>
          <div className="wbp-muted">Requests • Workflow • Status</div>
        </div>
      </div>

      <OrdersWorkspace
        shopId={shop.id}
        shopDomain={shop.shopDomain}
        activeRoute={activeRoute}
        cards={cards}
        counts={counts}
      />
    </main>
  );
}
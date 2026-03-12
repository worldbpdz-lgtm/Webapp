// src/app/app/reviews/[status]/page.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { reviewsAdmin } from "@/lib/supabase/reviews-admin";
import ReviewsWorkspace from "../reviews-workspace";

export const dynamic = "force-dynamic";

const allowed = new Set(["pending", "approved", "trash"] as const);

function mapStatus(status: string) {
  if (status === "trash") return "trashed";
  return status; // pending | approved
}

function normalizeShopDomain(v: string | null) {
  if (!v) return null;
  return String(v).trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

async function countByStatus(db: ReturnType<typeof reviewsAdmin>, shopDomain: string, status: string) {
  const { count, error } = await db
    .from("Review")
    .select("id", { count: "exact" }) // ✅ no head:true
    .eq("shopDomain", shopDomain)
    .eq("status", status)
    .limit(1); // ✅ minimal payload

  if (error) {
    // ✅ don’t hide it in dev; otherwise you’ll never know it failed
    if (process.env.NODE_ENV !== "production") {
      console.error("[reviews] count error:", status, error.message);
    }
    return 0;
  }

  return count ?? 0;
}

export default async function ReviewsStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ status: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { status } = await params;
  const sp = await searchParams;
  const q = (sp?.q ?? "").trim();

  if (!allowed.has(status as any)) redirect("/app/reviews/pending");

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  // Resolve shopDomain from LeadForm DB (same pattern as Orders)
  const shop = await prisma.shop.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, shopDomain: true },
  });

  if (!shop?.shopDomain) {
    return (
      <div className="orders-shell">
        <div className="wbp-card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 950, fontSize: 18 }}>No shop found</div>
          <div style={{ opacity: 0.7, marginTop: 6 }}>
            The dashboard couldn’t resolve a shopDomain from your LeadForm DB.
          </div>
        </div>
      </div>
    );
  }

  const db = reviewsAdmin();
  const prismaStatus = mapStatus(status);

  // Counts for tabs (always visible)
  const [pendingCount, approvedCount, trashCount] = await Promise.all([
    countByStatus(db, shop.shopDomain, "pending"),
    countByStatus(db, shop.shopDomain, "approved"),
    countByStatus(db, shop.shopDomain, "trashed"),
  ]);

  // Fetch current tab data (optionally filtered by q)
  let query = db
    .from("Review")
    .select(
      "id,shopDomain,productId,productHandle,rating,title,body,authorName,authorLastName,authorEmail,mediaUrl,status,createdAt,updatedAt"
    )
    .eq("shopDomain", shop.shopDomain)
    .eq("status", prismaStatus)
    .order("createdAt", { ascending: false })
    .limit(180);

  if (q) {
    query = query.or(
      `authorName.ilike.%${q}%,authorLastName.ilike.%${q}%,authorEmail.ilike.%${q}%,title.ilike.%${q}%,body.ilike.%${q}%,productHandle.ilike.%${q}%`
    );
  }

  const { data: rows, error } = await query;

  const reviews = (rows || []).map((r: any) => ({ ...r, productId: String(r.productId) }));

  return (
    <ReviewsWorkspace
      shopId={shop.id}
      shopDomain={shop.shopDomain}
      initialStatus={status as "pending" | "approved" | "trash"}
      initialReviews={reviews}
      initialError={error?.message || null}
      initialCounts={{ pending: pendingCount, approved: approvedCount, trash: trashCount }}
    />
  );
}
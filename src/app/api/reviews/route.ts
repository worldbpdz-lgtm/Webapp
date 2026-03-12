import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { reviewsAdmin } from "@/lib/supabase/reviews-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowed = new Set(["pending", "approved", "trashed", "trash"]);

function mapStatus(s: string) {
  return s === "trash" ? "trashed" : s;
}

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const shopDomain = (url.searchParams.get("shopDomain") || "").trim();
  const statusRaw = (url.searchParams.get("status") || "pending").trim();
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(Number(url.searchParams.get("limit") || "160"), 300);

  if (!shopDomain) return NextResponse.json({ error: "Missing shopDomain" }, { status: 400 });
  if (!allowed.has(statusRaw)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const status = mapStatus(statusRaw);
  const db = reviewsAdmin();

  let query = db
    .from("Review")
    .select(
      "id,shopDomain,productId,productHandle,rating,title,body,authorName,authorLastName,authorEmail,mediaUrl,status,createdAt,updatedAt"
    )
    .eq("shopDomain", shopDomain)
    .eq("status", status)
    .order("createdAt", { ascending: false })
    .limit(limit);

  if (q) {
    query = query.or(
      `authorName.ilike.%${q}%,authorLastName.ilike.%${q}%,authorEmail.ilike.%${q}%,title.ilike.%${q}%,body.ilike.%${q}%,productHandle.ilike.%${q}%`
    );
  }

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reviews = (rows || []).map((r: any) => ({ ...r, productId: String(r.productId) }));
  return NextResponse.json({ reviews });
}
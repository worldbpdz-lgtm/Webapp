// src/app/api/reviews/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { reviewsAdmin } from "@/lib/supabase/reviews-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowed = new Set(["pending", "approved", "trashed"]);

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return jsonError("Unauthorized", 401);

  const url = new URL(req.url);
  const shopDomain = (url.searchParams.get("shopDomain") || "").trim();
  if (!shopDomain) return jsonError("Missing shopDomain", 400);

  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({} as any));
  const status = String(body?.status || "").trim();
  if (!allowed.has(status)) return jsonError("Invalid status", 400);

  const db = reviewsAdmin();

  // ✅ Fix TS "never" by using an untyped builder for this table
  const table = (db as any).from("Review");

  const { data: rows, error } = await table
    .update({ status, updatedAt: new Date().toISOString() })
    .eq("id", id)
    .eq("shopDomain", shopDomain)
    .select("id,status")
    .limit(1);

  if (error) return jsonError(error.message, 400);
  if (!rows || rows.length === 0) return jsonError("Not found", 404);

  return NextResponse.json({ ok: true, review: rows[0] }, { status: 200 });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return jsonError("Unauthorized", 401);

  const url = new URL(req.url);
  const shopDomain = (url.searchParams.get("shopDomain") || "").trim();
  if (!shopDomain) return jsonError("Missing shopDomain", 400);

  const { id } = await ctx.params;

  const db = reviewsAdmin();
  const table = (db as any).from("Review");

  const { data: rows, error } = await table
    .delete()
    .eq("id", id)
    .eq("shopDomain", shopDomain)
    .select("id")
    .limit(1);

  if (error) return jsonError(error.message, 400);
  if (!rows || rows.length === 0) return jsonError("Not found", 404);

  return NextResponse.json({ ok: true }, { status: 200 });
}
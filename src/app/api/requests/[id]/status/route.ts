// src/app/api/requests/[id]/status/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseServer } from "@/lib/supabase/server";
import { getViewerAccess } from "@/lib/permissions.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowed = new Set(["in_review", "confirmed", "cancelled", "archived"]);
const PREV_KEY = "_wbpPrevStatus";

function asPlainObject(v: unknown): Record<string, any> {
  if (!v || typeof v !== "object") return {};
  if (Array.isArray(v)) return {};
  return v as Record<string, any>;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId");
  if (!shopId) return NextResponse.json({ error: "Missing shopId" }, { status: 400 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const status = String((body as any)?.status ?? "").trim();

  if (!allowed.has(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  // ✅ Permission enforcement
  const access = await getViewerAccess({
    shopId,
    userId: data.user.id,
    email: data.user.email ?? null,
  });

  const okByPerm =
    (status === "confirmed" && !!access.perms?.orders?.confirm) ||
    (status === "cancelled" && !!access.perms?.orders?.decline) ||
    (status === "in_review" && !!access.perms?.orders?.moveToReview) ||
    (status === "archived" && !!access.perms?.orders?.archive);

  if (!okByPerm) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ✅ If moving to archived, store previous status into values._wbpPrevStatus
  if (status === "archived") {
    const row = await prisma.request.findFirst({
      where: { id, shopId },
      select: { status: true, values: true },
    });

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const base = asPlainObject(row.values);
    const prev = String(row.status ?? "").trim(); // enum -> string

    const nextValues = { ...base, [PREV_KEY]: prev || "in_review" };

    const res = await prisma.request.updateMany({
      where: { id, shopId },
      data: { status: status as any, values: nextValues as any },
    });

    if (res.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  // ✅ For non-archived updates, we keep your original logic (no extra changes)
  const res = await prisma.request.updateMany({
    where: { id, shopId },
    data: { status: status as any },
  });

  if (res.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
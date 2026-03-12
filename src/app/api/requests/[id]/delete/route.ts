// src/app/api/requests/[id]/delete/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId");
  if (!shopId) return NextResponse.json({ error: "Missing shopId" }, { status: 400 });

  const { id } = await ctx.params;

  const res = await prisma.request.deleteMany({ where: { id, shopId } });
  if (res.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
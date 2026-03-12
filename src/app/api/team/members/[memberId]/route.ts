// src/app/api/team/members/[memberId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseServer } from "@/lib/supabase/server";
import { getViewerAccess } from "@/lib/permissions.server";
import type { MemberRole } from "@/lib/permissions";
import { normalizePermissions } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function mapViewerRoleToMemberRole(role: unknown): MemberRole {
  const r = String(role ?? "").trim().toLowerCase();
  if (r === "owner") return "owner";
  if (r === "admin") return "admin";
  return "member";
}

function adaptViewerPerms(raw: any) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const teamView = !!raw?.team?.view;
  const teamManage = !!raw?.team?.manage;
  if (teamView || teamManage) raw.pages = { ...(raw.pages || {}), team: true };
  return raw;
}

async function syncShopMemberIfUserExists(shopId: string, email: string, viewerRole: string, viewerPerms: any) {
  const u = await prisma.dashboardUser.findFirst({
    where: { shopId, email },
    select: { id: true },
  });
  if (!u) return;

  const role = mapViewerRoleToMemberRole(viewerRole);
  const perms = normalizePermissions(adaptViewerPerms(viewerPerms), role);

  await prisma.shopMember.upsert({
    where: { shopId_userId: { shopId, userId: u.id } },
    update: { role, permissions: perms, active: true },
    create: { shopId, userId: u.id, role, permissions: perms, active: true },
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ memberId: string }> }) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId");
  if (!shopId) return NextResponse.json({ error: "Missing shopId" }, { status: 400 });

  const access = await getViewerAccess({ shopId, userId: data.user.id, email: data.user.email ?? null });

  const canManage = !!access?.perms?.team?.manage;
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { memberId } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const name = (body as any)?.name ? String((body as any).name).trim() : null;
  const role = String((body as any)?.role ?? "staff").trim() || "staff";
  const perms = (body as any)?.perms ?? {};

  try {
    const rows = await prisma.$queryRaw<Array<any>>`
      update "Viewer"
      set
        "name" = ${name},
        "role" = ${role},
        "perms" = ${JSON.stringify(perms)}::jsonb,
        "updatedAt" = now()
      where "id" = ${memberId} and "shopId" = ${shopId}
      returning "id","shopId","email","name","role","perms","createdAt","updatedAt"
    `;

    const member = rows?.[0] ?? null;
    if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // ✅ NEW: sync ShopMember if user exists
    await syncShopMemberIfUserExists(shopId, String(member.email), String(member.role), member.perms);

    return NextResponse.json({ ok: true, member });
  } catch (e: any) {
    return NextResponse.json({ error: "Schema missing or mismatch", detail: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ memberId: string }> }) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId");
  if (!shopId) return NextResponse.json({ error: "Missing shopId" }, { status: 400 });

  const access = await getViewerAccess({ shopId, userId: data.user.id, email: data.user.email ?? null });

  const canManage = !!access?.perms?.team?.manage;
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { memberId } = await ctx.params;

  try {
    // Get email first so we can disable ShopMember if exists
    const prev = await prisma.$queryRaw<Array<any>>`
      select "email" from "Viewer" where "id" = ${memberId} and "shopId" = ${shopId} limit 1
    `;
    const email = prev?.[0]?.email ? String(prev[0].email).toLowerCase() : null;

    const res = await prisma.$executeRaw`
      delete from "Viewer"
      where "id" = ${memberId} and "shopId" = ${shopId}
    `;

    // Optional: disable access if user exists
    if (email) {
      const u = await prisma.dashboardUser.findFirst({ where: { shopId, email }, select: { id: true } });
      if (u && u.id !== data.user.id) {
        await prisma.shopMember.updateMany({
          where: { shopId, userId: u.id },
          data: { active: false },
        });
      }
    }

    return NextResponse.json({ ok: true, deleted: res });
  } catch (e: any) {
    return NextResponse.json({ error: "Schema missing or mismatch", detail: e?.message ?? String(e) }, { status: 500 });
  }
}
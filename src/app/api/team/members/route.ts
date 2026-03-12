// src/app/api/team/members/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseServer } from "@/lib/supabase/server";
import { getViewerAccess } from "@/lib/permissions.server";
import type { MemberRole } from "@/lib/permissions";
import { normalizePermissions } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeEmail(s: unknown) {
  return String(s ?? "").trim().toLowerCase();
}

function mapViewerRoleToMemberRole(role: unknown): MemberRole {
  const r = String(role ?? "").trim().toLowerCase();
  if (r === "owner") return "owner";
  if (r === "admin") return "admin";
  return "member"; // staff -> member
}

function adaptViewerPerms(raw: any) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const teamView = !!raw?.team?.view;
  const teamManage = !!raw?.team?.manage;
  if (teamView || teamManage) raw.pages = { ...(raw.pages || {}), team: true };
  return raw;
}

async function syncShopMemberIfUserExists(shopId: string, email: string, viewerRole: string, viewerPerms: any) {
  // Only possible if user already logged in at least once (DashboardUser exists)
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

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId");
  if (!shopId) return NextResponse.json({ error: "Missing shopId" }, { status: 400 });

  const access = await getViewerAccess({ shopId, userId: data.user.id, email: data.user.email ?? null });

  const canView = !!access?.perms?.team?.manage || !!access?.perms?.pages?.team;
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const rows = await prisma.$queryRaw<Array<any>>`
      select "id","shopId","email","name","role","perms","createdAt","updatedAt"
      from "Viewer"
      where "shopId" = ${shopId}
      order by "createdAt" desc
    `;
    return NextResponse.json({ members: rows ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: "Schema missing or mismatch", detail: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId");
  if (!shopId) return NextResponse.json({ error: "Missing shopId" }, { status: 400 });

  const access = await getViewerAccess({ shopId, userId: data.user.id, email: data.user.email ?? null });

  const canManage = !!access?.perms?.team?.manage;
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail((body as any)?.email);
  const name = (body as any)?.name ? String((body as any).name).trim() : null;
  const role = String((body as any)?.role ?? "staff").trim() || "staff";
  const perms = (body as any)?.perms ?? {};

  if (!email || !email.includes("@")) return NextResponse.json({ error: "Invalid email" }, { status: 400 });

  const id = crypto.randomUUID();

  try {
    const rows = await prisma.$queryRaw<Array<any>>`
      insert into "Viewer" ("id","shopId","email","name","role","perms","createdAt","updatedAt")
      values (${id}, ${shopId}, ${email}, ${name}, ${role}, ${JSON.stringify(perms)}::jsonb, now(), now())
      on conflict ("shopId","email")
      do update set
        "name" = excluded."name",
        "role" = excluded."role",
        "perms" = excluded."perms",
        "updatedAt" = now()
      returning "id","shopId","email","name","role","perms","createdAt","updatedAt"
    `;

    const member = rows?.[0] ?? null;

    // ✅ NEW: if that email already exists as a logged-in user, sync ShopMember now
    await syncShopMemberIfUserExists(shopId, email, role, perms);

    return NextResponse.json({ ok: true, member });
  } catch (e: any) {
    return NextResponse.json({ error: "Schema missing or mismatch", detail: e?.message ?? String(e) }, { status: 500 });
  }
}
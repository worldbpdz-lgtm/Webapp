import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseServer } from "@/lib/supabase/server";
import { getViewerAccess } from "@/lib/permissions.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

  // Same logic as your app: latest shop
  const shop = await prisma.shop.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, shopDomain: true },
  });

  if (!shop) return NextResponse.json({ ok: false, error: "No shop found" }, { status: 500 });

  const email = data.user.email ?? null;

  // Check viewer invite exists
  const invite = email
    ? await prisma.viewer.findUnique({
        where: { shopId_email: { shopId: shop.id, email: email.toLowerCase() } },
        select: { role: true, perms: true },
      })
    : null;

  // Check dashboard user + shop member
  const du = await prisma.dashboardUser.findUnique({
    where: { id: data.user.id },
    select: { id: true, email: true, shopId: true, createdAt: true, updatedAt: true },
  });

  const sm = await prisma.shopMember.findUnique({
    where: { shopId_userId: { shopId: shop.id, userId: data.user.id } },
    select: { id: true, role: true, active: true, permissions: true, createdAt: true, updatedAt: true },
  });

  // Try to compute access (this will also accept Viewer invites if your permissions.server.ts is correct)
  let access: any = null;
  let accessError: any = null;
  try {
    access = await getViewerAccess({
      shopId: shop.id,
      userId: data.user.id,
      email,
      name: (data.user.user_metadata as any)?.full_name ?? null,
    });
  } catch (e: any) {
    accessError = e?.message ?? String(e);
  }

  return NextResponse.json({
    ok: true,
    authUser: { id: data.user.id, email },
    shop,
    dashboardUser: du,
    shopMember: sm,
    viewerInvite: invite ? { role: invite.role, perms: invite.perms } : null,
    access,
    accessError,
  });
}
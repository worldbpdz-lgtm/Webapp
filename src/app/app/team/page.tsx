// src/app/app/team/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { supabaseServer } from "@/lib/supabase/server";
import { getViewerAccess } from "@/lib/permissions.server";
import TeamWorkspace from "./team-workspace";
import type { TeamMember } from "./team-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parsePerms(v: any) {
  if (!v) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (typeof v === "object") return v;
  return null;
}

export default async function TeamPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const shop = await prisma.shop.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, shopDomain: true },
  });

  if (!shop) {
    return (
      <div className="wbp-card wbp-surface" style={{ padding: 18 }}>
        <div style={{ fontWeight: 950, fontSize: 18 }}>No shop found</div>
        <div className="wbp-muted" style={{ marginTop: 6 }}>
          Add/seed a Shop row first, then refresh.
        </div>
      </div>
    );
  }

  const access = await getViewerAccess({
    shopId: shop.id,
    userId: data.user.id,
    email: data.user.email ?? null,
  });

  const canManage = !!access?.perms?.team?.manage;
  // ✅ FIX: no team.view in your perms type — use pages.team as "view access"
  const canView = canManage || !!access?.perms?.pages?.team;

  // Load members from "Viewer" table (raw SQL so compile won't break if Prisma model isn't present yet)
  let members: TeamMember[] = [];
  let schemaMissing = false;
  let schemaHint: string | null = null;

  if (canView) {
    try {
      const rows = await prisma.$queryRaw<Array<any>>`
        select
          "id",
          "shopId",
          "email",
          "name",
          "role",
          "perms",
          "createdAt",
          "updatedAt"
        from "Viewer"
        where "shopId" = ${shop.id}
        order by "createdAt" desc
      `;

      members = (rows || []).map((r) => ({
        id: String(r.id),
        shopId: String(r.shopId),
        email: String(r.email),
        name: r.name ? String(r.name) : null,
        role: r.role ? String(r.role) : "staff",
        perms: parsePerms(r.perms) ?? {},
        createdAt: r.createdAt ? String(r.createdAt) : new Date().toISOString(),
        updatedAt: r.updatedAt ? String(r.updatedAt) : null,
      }));
    } catch (e: any) {
      schemaMissing = true;
      schemaHint =
        e?.message?.includes('relation "Viewer" does not exist')
          ? `Missing table "Viewer". Add the Prisma model and migrate.`
          : "Could not load members (DB schema mismatch).";
      members = [];
    }
  }

  if (!canView) {
    return (
      <div className="team-shell">
        <div className="team-hero wbp-card wbp-surface">
          <div className="team-hero__title">Team & Access</div>
          <div className="team-hero__sub">You don’t have access to view this page.</div>
        </div>
      </div>
    );
  }

  return (
    <TeamWorkspace
      shopId={shop.id}
      shopDomain={shop.shopDomain}
      initialMembers={members}
      canManage={canManage}
      schemaMissing={schemaMissing}
      schemaHint={schemaHint}
    />
  );
}
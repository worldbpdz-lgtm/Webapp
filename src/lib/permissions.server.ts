import "server-only";
import { prisma } from "@/lib/prisma";
import type { MemberRole, Permissions } from "@/lib/permissions";
import { normalizePermissions, permsForRole } from "@/lib/permissions";

export class ForbiddenError extends Error {
  constructor() {
    super("FORBIDDEN");
  }
}

function normEmail(v: string | null | undefined) {
  return String(v ?? "").trim().toLowerCase();
}

function mapViewerRoleToMemberRole(viewerRole: unknown): MemberRole {
  const r = String(viewerRole ?? "").trim().toLowerCase();
  if (r === "owner") return "owner";
  if (r === "admin") return "admin";
  // "staff" or anything else -> member
  return "member";
}

/**
 * Viewer perms may contain `team.view` (your app perms doesn't).
 * We treat team.view (or team.manage) as: pages.team = true.
 */
function adaptViewerPerms(raw: any): any {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;

  const teamView = !!raw?.team?.view;
  const teamManage = !!raw?.team?.manage;

  if (teamView || teamManage) {
    raw.pages = { ...(raw.pages || {}), team: true };
  }

  return raw;
}

export async function getViewerAccess(opts: {
  shopId: string;
  userId: string;
  email?: string | null;
  name?: string | null;
}): Promise<{ role: MemberRole; perms: Permissions; memberId: string }> {
  // Upsert user profile
  await prisma.dashboardUser.upsert({
    where: { id: opts.userId },
    update: {
      email: opts.email ?? undefined,
      name: opts.name ?? undefined,
      shopId: opts.shopId,
    },
    create: {
      id: opts.userId,
      email: opts.email ?? null,
      name: opts.name ?? null,
      shopId: opts.shopId,
    },
  });

  let member = await prisma.shopMember.findUnique({
    where: { shopId_userId: { shopId: opts.shopId, userId: opts.userId } },
  });

  if (!member) {
    // ✅ Only auto-create owner if this is the first member for this shop
    const count = await prisma.shopMember.count({ where: { shopId: opts.shopId } });
    if (count === 0) {
      const role: MemberRole = "owner";
      const perms = permsForRole(role);
      member = await prisma.shopMember.create({
        data: {
          shopId: opts.shopId,
          userId: opts.userId,
          role,
          permissions: perms,
          active: true,
        },
      });
      return { role, perms, memberId: member.id };
    }

    // ✅ NEW: Accept an invite from Viewer by matching email
    const email = normEmail(opts.email);
    if (email) {
      const invite = await prisma.viewer.findUnique({
        where: { shopId_email: { shopId: opts.shopId, email } },
        select: { role: true, perms: true },
      });

      if (invite) {
        const role = mapViewerRoleToMemberRole(invite.role);
        const perms = normalizePermissions(adaptViewerPerms(invite.perms), role);

        member = await prisma.shopMember.create({
          data: {
            shopId: opts.shopId,
            userId: opts.userId,
            role,
            permissions: perms,
            active: true,
          },
        });

        return { role, perms, memberId: member.id };
      }
    }

    throw new ForbiddenError();
  }

  if (!member.active) throw new ForbiddenError();

  const role = member.role as MemberRole;
  const perms = normalizePermissions(member.permissions, role);
  return { role, perms, memberId: member.id };
}
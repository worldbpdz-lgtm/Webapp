import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { supabaseServer } from "@/lib/supabase/server";
import AppShell from "@/components/shell/AppShell";
import { PermissionsProvider } from "@/components/shell/permissions-context";
import { ForbiddenError, getViewerAccess } from "@/lib/permissions.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  // prefer shop linked to this user, fallback to latest
  const du = await prisma.dashboardUser.findUnique({ where: { id: data.user.id }, select: { shopId: true } });
  const shop = du?.shopId
    ? await prisma.shop.findUnique({ where: { id: du.shopId } })
    : await prisma.shop.findFirst({ orderBy: { createdAt: "desc" } });

  if (!shop) return <div className="wbp-muted">No shop found in DB.</div>;

  try {
    const access = await getViewerAccess({
      shopId: shop.id,
      userId: data.user.id,
      email: data.user.email ?? null,
      name: (data.user.user_metadata as any)?.full_name ?? null,
    });

    return (
      <PermissionsProvider value={access.perms}>
        <AppShell>{children}</AppShell>
      </PermissionsProvider>
    );
  } catch (e: any) {
    if (e instanceof ForbiddenError) {
      redirect(`/login?error=access_denied&next=${encodeURIComponent("/app/orders/review")}`);
    }
    throw e;
  }
}
// src/app/app/trash/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import TrashClient from "./trash-client";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const shop = await prisma.shop.findFirst({
    select: { id: true, shopDomain: true },
    orderBy: { createdAt: "desc" },
  });

  if (!shop) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold">Trash</h1>
        <div className="mt-6 wbp-glass wbp-card p-4">No Shop found in database yet.</div>
      </main>
    );
  }

  const rows = await prisma.request.findMany({
    where: { shopId: shop.id, status: "archived" as any },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      createdAt: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      roleType: true,
      values: true, // ✅ add this
    },
  });

  return (
    <main className="p-6">
      <div className="wbp-page-head">
        <div>
          <h1>Trash</h1>
          <div className="wbp-muted">Restore deleted orders or delete permanently</div>
        </div>
      </div>

      <div className="wbp-glass p-4">
        <TrashClient
          shopId={shop.id}
          initialRows={rows.map((r) => {
            const v: any = r.values as any;
            const prevStatus = v?._wbpPrevStatus ? String(v._wbpPrevStatus) : null;

            return {
              id: r.id,
              createdAt: r.createdAt.toISOString(),
              firstName: r.firstName,
              lastName: r.lastName,
              email: r.email,
              phone: r.phone,
              roleType: String(r.roleType),
              prevStatus, // ✅ add this
            };
          })}
        />
      </div>
    </main>
  );
}
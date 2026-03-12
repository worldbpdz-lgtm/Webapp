// src/app/app/orders/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  redirect("/app/orders/review");
}
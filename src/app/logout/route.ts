import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url));
}
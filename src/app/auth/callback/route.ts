import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ForbiddenError, getViewerAccess } from "@/lib/permissions.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeNext(raw: string | null) {
  const n = (raw || "").trim();
  if (!n.startsWith("/")) return "/app/orders/review";
  return n || "/app/orders/review";
}

function addToast(url: URL, toast: string) {
  url.searchParams.set("toast", toast);
  return url;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const origin = url.origin;

  // If provider returned an OAuth error
  const oauthErr = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (oauthErr) {
    const back = new URL("/login", origin);
    back.searchParams.set("toast", "login_failed");
    back.searchParams.set("error", "oauth_error");
    return NextResponse.redirect(back);
  }

  const code = url.searchParams.get("code");
  const supabase = await supabaseServer();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const back = new URL("/login", origin);
      back.searchParams.set("toast", "login_failed");
      back.searchParams.set("error", error.message);
      return NextResponse.redirect(back);
    }
  }

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    const back = new URL("/login", origin);
    back.searchParams.set("toast", "login_failed");
    back.searchParams.set("error", "no_user");
    return NextResponse.redirect(back);
  }

  // pick latest shop (single-shop setup)
  const shop = await prisma.shop.findFirst({ orderBy: { createdAt: "desc" } });
  if (!shop) {
    await supabase.auth.signOut();
    const back = new URL("/login", origin);
    back.searchParams.set("toast", "login_failed");
    back.searchParams.set("error", "no_shop");
    return NextResponse.redirect(back);
  }

  try {
    await getViewerAccess({
      shopId: shop.id,
      userId: user.id,
      email: user.email ?? null,
      name: (user.user_metadata as any)?.full_name ?? null,
    });
  } catch (e: any) {
    // Not allowed → kick back + toast
    await supabase.auth.signOut();

    // Optional but recommended: remove the created auth user so nobody "creates accounts"
    if (e instanceof ForbiddenError) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(user.id);
      } catch {}
    }

    const back = new URL("/login", origin);
    back.searchParams.set("toast", "login_failed");
    back.searchParams.set("error", "forbidden");
    return NextResponse.redirect(back);
  }

  // Allowed → go to app with success toast
  const dest = new URL(next, origin);
  addToast(dest, "login_ok");
  return NextResponse.redirect(dest);
}
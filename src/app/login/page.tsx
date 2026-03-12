// ...existing imports
import LoginClient from "./login-client";
import { supabaseServer } from "@/lib/supabase/server";

function safeNext(next: unknown) {
  const n = typeof next === "string" ? next : "";
  if (!n.startsWith("/")) return "/app/orders/review";
  return n || "/app/orders/review";
}

export default async function LoginPage({ searchParams }: { searchParams?: any }) {
  const sp = await Promise.resolve(searchParams ?? {});

  const next = safeNext(sp?.next);
  const err = typeof sp?.error === "string" ? sp.error : null;
  const toast = typeof sp?.toast === "string" ? sp.toast : null;

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();

  // ...your existing "if logged in then check access and redirect" logic

  return (
    <LoginClient
      initialError={err}
      initialNext={next}
      signedInEmail={data.user?.email ?? null}
      initialToast={toast}
    />
  );
}
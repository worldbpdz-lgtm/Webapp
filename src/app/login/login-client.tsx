"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type Props = {
  initialError: string | null;
  initialNext: string;
  signedInEmail: string | null;
  initialToast: string | null; // <-- new
};

function prettyError(e: string) {
  const s = (e || "").toLowerCase();
  if (s.includes("forbidden") || s.includes("access_denied")) return "This Gmail is not allowed for this dashboard.";
  if (s.includes("oauth") || s.includes("provider")) return "Login failed. Please try again.";
  if (s.includes("missing code verifier")) return "Login session couldn’t be completed. Try again.";
  return e;
}

type ToastKind = "ok" | "bad";

export default function LoginClient({ initialError, initialNext, signedInEmail, initialToast }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ kind: ToastKind; msg: string } | null>(null);
  const [error, setError] = useState<string | null>(initialError ? prettyError(initialError) : null);

  const nextPath = initialNext || "/app/orders/review";

  function callbackUrl() {
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
  }

  function showToast(kind: ToastKind, msg: string, ms = 2600) {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), ms);
  }

  useEffect(() => {
    if (initialToast === "login_ok") showToast("ok", "Login successful");
    if (initialToast === "login_failed") showToast("bad", "Login failed — Gmail not allowed");
    // If you want an error toast too:
    if (initialError && !initialToast) showToast("bad", prettyError(initialError));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    setLoading(true);
    setError(null);
    await supabase.auth.signOut();
    router.refresh();
    setLoading(false);
  }

  async function continueWithEmail() {
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl(),
        // forces account chooser every time
        queryParams: { prompt: "select_account" },
      },
    });

    if (error) {
      setError(prettyError(error.message));
      showToast("bad", "Login failed");
      setLoading(false);
    }
    // success redirects away
  }

  return (
    <div className="login-wrap">
      <div className="login-bg" aria-hidden="true" />

      <div className="login-frame">
        <div className="login-card wbp-card wbp-surface">
          <div className="login-head">
            <div className="login-title">WBP Dashboard</div>
            <div className="login-sub">Invite-only. Select your Gmail to sign in.</div>
          </div>

          {signedInEmail ? (
            <div className="login-banner">
              <div className="login-banner__t">Signed in as</div>
              <div className="login-banner__v">{signedInEmail}</div>
              <div className="login-banner__s">You’re logged in but not allowed for this dashboard.</div>
              <button className="orders-btn orders-btn--danger" type="button" onClick={signOut} disabled={loading}>
                Sign out
              </button>
            </div>
          ) : null}

          {error ? <div className="login-msg login-msg--bad">{error}</div> : null}

          <div className="login-grid">
            <button
              type="button"
              className="login-primary"
              onClick={continueWithEmail}
              disabled={loading}
            >
              {loading ? "Opening Gmail…" : "Continue with email"}
              <span className="login-primary__shine" aria-hidden="true" />
            </button>

            <div className="login-foot">
              If the selected Gmail is not in <b>Team &amp; Access</b>, you’ll be sent back here.
            </div>

            <button
              type="button"
              className="login-ghost"
              onClick={() => router.push("/")}
              disabled={loading}
            >
              Back
            </button>
          </div>
        </div>
      </div>

      {/* Bottom-left toast */}
      {toast ? (
        <div className="wbp-toast" data-kind={toast.kind}>
          <div className="wbp-toast__dot" />
          <div className="wbp-toast__msg">{toast.msg}</div>
        </div>
      ) : null}

      <style jsx>{`
        .login-wrap{
          min-height:100dvh;
          display:grid;
          place-items:center;
          padding:22px;
          position:relative;
          overflow:hidden;
        }
        .login-bg{
          position:absolute; inset:-2px;
          background:
            radial-gradient(900px 650px at 18% 12%, rgba(255,185,70,.30), transparent 62%),
            radial-gradient(900px 650px at 86% 18%, rgba(255,80,160,.18), transparent 66%),
            radial-gradient(900px 700px at 36% 112%, rgba(80,180,255,.14), transparent 60%),
            linear-gradient(180deg, rgba(255,255,255,.06), rgba(0,0,0,.06));
          filter:saturate(1.1);
          animation: floatBg 10.5s ease-in-out infinite;
        }
        @keyframes floatBg{
          0%,100%{ transform: translate3d(0,0,0) scale(1); }
          50%{ transform: translate3d(0,-10px,0) scale(1.03); }
        }

        /* REAL gradient border, not mask/spinning overlay */
        .login-frame{
          width:min(540px, 100%);
          border-radius:24px;
          padding:1px;
          background: linear-gradient(90deg,
            rgba(255,180,60,.70),
            rgba(255,80,160,.55),
            rgba(80,180,255,.40),
            rgba(255,180,60,.70)
          );
          background-size: 300% 300%;
          animation: borderFlow 7.5s ease-in-out infinite;
          box-shadow: 0 30px 90px rgba(0,0,0,.10);
        }
        @keyframes borderFlow{
          0%,100%{ background-position: 0% 50%; }
          50%{ background-position: 100% 50%; }
        }

        .login-card{ border-radius:23px; padding:18px; }

        .login-head{ display:grid; gap:6px; }
        .login-title{ font-weight:980; font-size:24px; letter-spacing:.2px; }
        .login-sub{ opacity:.78; font-size:13px; }

        .login-grid{ margin-top:16px; display:grid; gap:12px; }

        .login-primary{
          width:100%;
          display:flex;
          align-items:center;
          justify-content:center;
          border:0;
          border-radius:16px;
          padding:12px 12px;
          cursor:pointer;
          font-weight:960;
          letter-spacing:.15px;
          position:relative;
          color: rgba(20,12,10,.96);
          background: linear-gradient(135deg,
            rgba(255,180,60,.98),
            rgba(255,110,80,.96),
            rgba(255,80,160,.92)
          );
          box-shadow: 0 18px 60px rgba(255,140,70,.16);
          overflow:hidden;
          transition: transform .14s ease, filter .14s ease, box-shadow .14s ease;
        }
        .login-primary:hover{
          transform: translateY(-1px);
          filter:saturate(1.05);
          box-shadow: 0 22px 70px rgba(255,140,70,.20);
        }
        .login-primary:disabled{ opacity:.75; cursor:not-allowed; transform:none; }

        .login-primary__shine{
          position:absolute;
          top:-40%;
          left:-60%;
          width:55%;
          height:180%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.40), transparent);
          transform: rotate(20deg);
          animation: sweep 2.9s ease-in-out infinite;
          pointer-events:none;
          opacity:.65;
        }
        @keyframes sweep{
          0%{ left:-60%; opacity:0; }
          12%{ opacity:.55; }
          45%{ left:120%; opacity:.35; }
          100%{ left:120%; opacity:0; }
        }

        .login-ghost{
          width:100%;
          border-radius:16px;
          padding:12px 12px;
          border:1px solid rgba(255,255,255,.22);
          background: rgba(255,255,255,.22);
          backdrop-filter: blur(14px);
          cursor:pointer;
          font-weight:900;
          opacity:.9;
          transition: transform .14s ease, opacity .14s ease;
        }
        .login-ghost:hover{ transform: translateY(-1px); opacity:1; }
        :global(html.dark) .login-ghost, :global(body.dark) .login-ghost, :global([data-theme="dark"]) .login-ghost{
          background: rgba(10,12,16,.42);
          border-color: rgba(255,255,255,.12);
          color: rgba(255,255,255,.88);
        }

        .login-msg{
          margin-top:12px;
          padding:12px;
          border-radius:16px;
          font-weight:900;
          border:1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.35);
        }
        .login-msg--bad{ border-color: rgba(255,80,80,.28); background: rgba(255,80,80,.10); }

        .login-banner{
          margin-top:12px;
          padding:12px;
          border-radius:16px;
          border:1px solid rgba(255,200,80,.25);
          background: rgba(255,200,80,.10);
          display:grid;
          gap:6px;
        }
        .login-banner__t{ font-weight:950; font-size:12px; opacity:.8; }
        .login-banner__v{ font-weight:980; }
        .login-banner__s{ opacity:.85; font-size:12px; }

        .login-foot{
          margin-top:2px;
          font-size:12px;
          opacity:.82;
          text-align:center;
        }

        .wbp-toast{
          position:fixed;
          left:18px;
          bottom:18px;
          display:flex;
          align-items:center;
          gap:10px;
          padding:12px 14px;
          border-radius:16px;
          border:1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.32);
          backdrop-filter: blur(14px);
          box-shadow: 0 18px 60px rgba(0,0,0,.12);
          font-weight:900;
          animation: toastIn .18s ease-out;
          z-index:9999;
        }
        @keyframes toastIn{
          from{ transform: translateY(8px); opacity:0; }
          to{ transform: translateY(0); opacity:1; }
        }
        .wbp-toast__dot{
          width:10px; height:10px; border-radius:999px;
          background: rgba(255,255,255,.92);
        }
        .wbp-toast[data-kind="ok"]{
          border-color: rgba(80,255,160,.22);
          background: rgba(80,255,160,.08);
        }
        .wbp-toast[data-kind="ok"] .wbp-toast__dot{ background: rgba(80,255,160,.95); }
        .wbp-toast[data-kind="bad"]{
          border-color: rgba(255,80,80,.28);
          background: rgba(255,80,80,.10);
        }
        .wbp-toast[data-kind="bad"] .wbp-toast__dot{ background: rgba(255,80,80,.95); }

        @media (prefers-reduced-motion: reduce){
          .login-bg, .login-frame, .login-primary__shine{ animation:none !important; }
        }
      `}</style>
    </div>
  );
}
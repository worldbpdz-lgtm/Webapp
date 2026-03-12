"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useShell } from "./AppShell";
import { useEffect, useMemo, useState } from "react";
import { usePermissions } from "@/components/shell/permissions-context";
import { supabaseBrowser } from "@/lib/supabase/client";

// ✅ IMPORTANT: Hooks must NOT run at module scope.
// Keep base nav items here, filter inside Sidebar().
const BASE_NAV = [
  { href: "/app/orders/review", match: "/app/orders", label: "Orders", icon: "orders" },
  { href: "/app/reviews/pending", match: "/app/reviews", label: "Reviews", icon: "reviews" },
  { href: "/app/analytics", match: "/app/analytics", label: "Analytics", icon: "analytics" },
  { href: "/app/team", match: "/app/team", label: "Team & Access", icon: "team" },
  { href: "/app/trash", match: "/app/trash", label: "Trash", icon: "trash" },
  { href: "/app/settings", match: "/app/settings", label: "Settings", icon: "settings" },
] as const;

type BaseItem = (typeof BASE_NAV)[number];

function Icon({ name }: { name: BaseItem["icon"] }) {
  const p = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    style: { display: "block" } as const,
  };

  if (name === "orders") {
    return (
      <svg {...p}>
        <path d="M21 8a2 2 0 0 0-2-2H7L5 4H3" />
        <path d="M7 6l1.5 9h9.5" />
        <circle cx="9" cy="20" r="1" />
        <circle cx="18" cy="20" r="1" />
      </svg>
    );
  }

  if (name === "reviews") {
    return (
      <svg {...p}>
        <path d="M12 17.3l-6.2 3.3 1.2-7-5-4.9 7-.9L12 2l3 6.5 7 .9-5 4.9 1.2 7z" />
      </svg>
    );
  }

  if (name === "team") {
    return (
      <svg {...p}>
        <circle cx="12" cy="7" r="4" />
        <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
      </svg>
    );
  }

  if (name === "trash") {
    return (
      <svg {...p}>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M6 6l1 16h10l1-16" />
        <path d="M10 11v7" />
        <path d="M14 11v7" />
      </svg>
    );
  }

  if (name === "analytics") {
    return (
      <svg {...p}>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M7 15l3-4 3 2 4-6" />
        <circle cx="7" cy="15" r="1" />
        <circle cx="10" cy="11" r="1" />
        <circle cx="13" cy="13" r="1" />
        <circle cx="17" cy="7" r="1" />
      </svg>
    );
  }

  // settings
  return (
    <svg
      {...p}
      width={20}
      height={20}
      style={{ display: "block", transform: "translateY(-0.5px)" }}
    >
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function Hamburger() {
  return (
    <svg className="wbp-collapse-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 7h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M5 17h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function ArrowLeft() {
  return (
    <svg className="wbp-collapse-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg className="wbp-collapse-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 7V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path d="M3 12h11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M7 8l-4 4 4 4"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const { collapsed, sidebarOpen, closeSidebar, toggleCollapsed } = useShell();
  const [pulseHref, setPulseHref] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const perms = usePermissions();

  const nav = useMemo(() => {
    return [
      perms.pages.orders && { href: "/app/orders/review", match: "/app/orders", label: "Orders", icon: "orders" },
      perms.pages.reviews && { href: "/app/reviews/pending", match: "/app/reviews", label: "Reviews", icon: "reviews" },
      perms.pages.analytics && { href: "/app/analytics", match: "/app/analytics", label: "Analytics", icon: "analytics" },
      perms.pages.team && { href: "/app/team", match: "/app/team", label: "Team & Access", icon: "team" },
      perms.pages.trash && { href: "/app/trash", match: "/app/trash", label: "Trash", icon: "trash" },
      perms.pages.settings && { href: "/app/settings", match: "/app/settings", label: "Settings", icon: "settings" },
    ].filter(Boolean) as Array<{ href: string; match: string; label: string; icon: BaseItem["icon"] }>;
  }, [perms]);

  useEffect(() => {
    if (!pulseHref) return;
    const t = window.setTimeout(() => setPulseHref(null), 340);
    return () => window.clearTimeout(t);
  }, [pulseHref]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      closeSidebar();
      router.replace("/login?toast=logout_ok");
      router.refresh();
      setLoggingOut(false);
    }
  }

  return (
    <>
      <div
        onClick={closeSidebar}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,.45)",
          opacity: sidebarOpen ? 1 : 0,
          pointerEvents: sidebarOpen ? "auto" : "none",
          transition: "opacity var(--dur-2) var(--ease)",
          zIndex: 40,
        }}
      />

      <aside
        data-open={sidebarOpen ? "true" : "false"}
        className="wbp-glass"
        style={{
          position: "sticky",
          top: 0,
          height: "100dvh",
          padding: 16,
          borderRadius: 0,
          borderTop: 0,
          borderLeft: 0,
          borderBottom: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <style>{`
          @media (max-width: 980px){
            aside{
              position: fixed !important;
              left:0; top:0;
              width: ${collapsed ? "92px" : "300px"};
              transform: translateX(-110%);
              transition: transform var(--dur-3) var(--ease);
              box-shadow: var(--shadow-2);
              border-radius:0;
              z-index: 60;
            }
            aside[data-open="true"]{ transform: translateX(0); }
          }

          /* ✅ Scroll only the nav area (auto), keep Logout fixed */
          aside .wbp-navScroll{
            flex: 1;
            min-height: 0; /* IMPORTANT for flex children to allow scrolling */
            overflow-y: auto;
            overflow-x: hidden;
            padding-top: 4px;
            padding-bottom: 10px;
            padding-right: 6px;
            margin-right: -6px; /* so content aligns even with scrollbar */
            overscroll-behavior: contain;
          }

          /* Scrollbar: subtle, only relevant when overflow exists */
          aside .wbp-navScroll::-webkit-scrollbar{ width: 10px; }
          aside .wbp-navScroll::-webkit-scrollbar-track{ background: transparent; }
          aside .wbp-navScroll::-webkit-scrollbar-thumb{
            background: rgba(255,255,255,.10);
            border-radius: 999px;
            border: 3px solid transparent;
            background-clip: padding-box;
          }
          aside .wbp-navScroll:hover::-webkit-scrollbar-thumb{
            background: rgba(255,255,255,.16);
            border: 3px solid transparent;
            background-clip: padding-box;
          }
          @supports (scrollbar-color: auto){
            aside .wbp-navScroll{
              scrollbar-width: thin;
              scrollbar-color: rgba(255,255,255,.16) transparent;
            }
          }

          /* Slightly tighten spacing on short screens so Logout stays visible nicer */
          @media (max-height: 760px){
            aside{ padding: 14px; }
            aside .wbp-navScroll{ padding-bottom: 8px; }
            aside .wbp-nav-item{ transform: translateZ(0); }
          }

          .wbp-nav-item--danger{
            color: rgba(255,120,120,.95);
          }
          .wbp-nav-item--danger:hover{
            box-shadow: 0 0 0 1px rgba(255,120,120,.22) inset, 0 18px 60px rgba(255,80,80,.10);
          }
        `}</style>

        {/* Header (fixed) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 10px 18px",
            justifyContent: "space-between",
            flex: "0 0 auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div className="wbp-btn wbp-btn-sunset" style={{ width: 46, height: 46, padding: 0, borderRadius: 18 }}>
              W
            </div>

            {!collapsed && (
              <div style={{ lineHeight: 1.05, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 950,
                    letterSpacing: "-0.02em",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  WBP Dashboard
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Internal Ops</div>
              </div>
            )}
          </div>

          <button
            className="wbp-iconbtn"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            type="button"
          >
            {collapsed ? <Hamburger /> : <ArrowLeft />}
          </button>
        </div>

        {/* ✅ Scrollable nav only */}
        <div className="wbp-navScroll">
          <nav className="wbp-nav">
            {nav.map((item) => {
              const active = pathname?.startsWith(item.match);
              const pulse = pulseHref === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    setPulseHref(item.href);
                    closeSidebar();
                  }}
                  className={[
                    "wbp-nav-item",
                    active ? "wbp-nav-item--active" : "",
                    pulse ? "wbp-nav-item--pulse" : "",
                  ].join(" ")}
                >
                  <span className="wbp-ico">
                    <Icon name={item.icon} />
                  </span>

                  {!collapsed && <span style={{ fontWeight: 950 }}>{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer (fixed) */}
        <div style={{ flex: "0 0 auto", paddingTop: 10 }}>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className={["wbp-nav-item", "wbp-nav-item--danger"].join(" ")}
            title="Logout"
            style={{ width: "100%", justifyContent: collapsed ? "center" : "flex-start" }}
          >
            <span className="wbp-ico">
              <LogoutIcon />
            </span>
            {!collapsed && <span style={{ fontWeight: 950 }}>{loggingOut ? "Logging out…" : "Logout"}</span>}
          </button>

          <div style={{ marginTop: 12, opacity: 0.75, fontSize: 12, paddingLeft: 10 }}>
            {!collapsed ? "v1 • Sunset Glass" : ""}
          </div>
        </div>
      </aside>
    </>
  );
}
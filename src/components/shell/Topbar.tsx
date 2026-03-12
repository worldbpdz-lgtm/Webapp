"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useShell } from "./AppShell";

function SearchIcon() {
  return (
    <svg
      className="wbp-search__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function PanelIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 4h16v16H4z" />
      <path d="M9 4v16" />
      <path d="M12.5 8h5" />
      <path d="M12.5 12h5" />
      <path d="M12.5 16h5" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z"
        fill="currentColor"
        opacity="0.95"
      />
      <path
        d="M12 1.7v2.2M12 20.1v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M1.7 12h2.2M20.1 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21 14.2A8.3 8.3 0 0 1 9.8 3a7 7 0 1 0 11.2 11.2Z"
        fill="currentColor"
        opacity="0.95"
      />
    </svg>
  );
}

function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem("wbp-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

function ThemeSwitch({
  theme,
  onToggle,
}: {
  theme: "light" | "dark";
  onToggle: () => void;
}) {
  const isDark = theme === "dark";

  return (
    <button
      className="wbp-theme-toggle"
      role="switch"
      aria-checked={isDark}
      aria-label="Toggle theme"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      data-mode={theme}
      onClick={onToggle}
      type="button"
    >
      <span className="wbp-theme-track" aria-hidden="true">
        <span className="wbp-theme-ico wbp-theme-sun">
          <SunIcon />
        </span>
        <span className="wbp-theme-ico wbp-theme-moon">
          <MoonIcon />
        </span>
        <span className="wbp-theme-thumb" />
      </span>
    </button>
  );
}

function titleForPath(pathname: string) {
  if (pathname.startsWith("/app/trash")) return "Trash";
  if (pathname.startsWith("/app/orders")) return "Orders";
  if (pathname.startsWith("/app/reviews")) return "Reviews";
  if (pathname.startsWith("/app/team")) return "Team & Access";
  if (pathname.startsWith("/app/settings")) return "Settings";
  return "Dashboard";
}

export default function Topbar() {
  const { openSidebar } = useShell();
  const router = useRouter();
  const pathname = usePathname() || "";
  const sp = useSearchParams();

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [query, setQuery] = useState("");

  const tRef = useRef<number | null>(null);

  useEffect(() => {
    const t = getInitialTheme();
    setTheme(t);
    document.documentElement.dataset.theme = t;
  }, []);

  useEffect(() => {
    setQuery((sp?.get("q") || "").toString());
  }, [sp]);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("wbp-theme", next);
  }

  function updateQ(next: string) {
    setQuery(next);

    if (tRef.current) window.clearTimeout(tRef.current);
    tRef.current = window.setTimeout(() => {
      const params = new URLSearchParams(sp?.toString() || "");
      const v = next.trim();
      if (v) params.set("q", v);
      else params.delete("q");

      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);

      // ✅ Reviews data is server-loaded; refresh so it refetches with q
      if (pathname.startsWith("/app/reviews")) {
        window.setTimeout(() => router.refresh(), 90);
      }
    }, 140);
  }

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        borderBottom: "1px solid rgba(var(--border), .88)",
        background: "rgba(var(--panel), .68)",
        backdropFilter: "blur(18px)",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          padding: "14px 18px",
          maxWidth: 1280,
          margin: "0 auto",
        }}
      >
        <button
          className="wbp-iconbtn"
          onClick={openSidebar}
          style={{ display: "none" }}
          id="mobileOpenSidebarBtn"
          aria-label="Open sidebar"
          title="Open sidebar"
          type="button"
        >
          <PanelIcon />
        </button>
        <style>{`@media (max-width: 980px){ #mobileOpenSidebarBtn{ display:grid !important; } }`}</style>

        <div style={{ display: "grid", lineHeight: 1.05, minWidth: 160 }}>
          <div style={{ fontWeight: 950, letterSpacing: "-0.02em" }}>{titleForPath(pathname)}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Search • Filter • Workflow</div>
        </div>

        <div style={{ flex: 1, minWidth: 0, maxWidth: 760 }}>
          <div className="wbp-search">
            <div className="wbp-search__inner">
              <SearchIcon />
              <input
                value={query}
                onChange={(e) => updateQ(e.target.value)}
                placeholder="Search ..."
                aria-label="Search"
              />
            </div>
          </div>
        </div>

        <ThemeSwitch theme={theme} onToggle={toggleTheme} />
        <span className="wbp-pill wbp-pill-sunset">Admin</span>
      </div>
    </header>
  );
}
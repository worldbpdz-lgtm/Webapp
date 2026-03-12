"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

type ShellContextValue = {
  collapsed: boolean;
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleCollapsed: () => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within <AppShell />");
  return ctx;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSidebarOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<ShellContextValue>(
    () => ({
      collapsed,
      sidebarOpen,
      openSidebar: () => setSidebarOpen(true),
      closeSidebar: () => setSidebarOpen(false),
      toggleCollapsed: () => setCollapsed((v) => !v),
    }),
    [collapsed, sidebarOpen]
  );

  return (
    <ShellContext.Provider value={value}>
      <div
        style={{
          minHeight: "100dvh",
          display: "grid",
          gridTemplateColumns: collapsed ? "92px 1fr" : "300px 1fr",
        }}
      >
        <Sidebar />

        <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
          <Topbar />
          <main style={{ padding: "22px 22px 34px", minWidth: 0 }}>
            <div style={{ maxWidth: 1280, margin: "0 auto" }}>{children}</div>
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
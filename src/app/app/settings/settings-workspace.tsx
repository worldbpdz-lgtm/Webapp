// src/app/app/settings/settings-workspace.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ShopLite = { id: string; shopDomain: string; createdAt: Date };

type ThemePref = "system" | "light" | "dark";
type Accent = "sunset" | "amber" | "coral" | "mint" | "indigo";
type Density = "comfortable" | "compact";
type Motion = "full" | "reduced";

type SettingsDTO = {
  shopId: string;
  workspaceName: string;
  appearance: { theme: ThemePref; accent: Accent; density: Density; motion: Motion };
  navigation: { orders: boolean; reviews: boolean; analytics: boolean; team: boolean; trash: boolean; settings: boolean };
  notifications: { newOrder: boolean; newReview: boolean; dailyDigest: boolean };
  security: { require2fa: boolean; sessionTimeoutMins: number };
};

type Props = {
  shops: ShopLite[];
  activeShopId: string;
  initial: SettingsDTO;
};

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function applyTheme(theme: ThemePref) {
  const root = document.documentElement;

  const systemDark =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

  const isDark = theme === "dark" ? true : theme === "light" ? false : systemDark;

  root.dataset.theme = isDark ? "dark" : "light";
  root.classList.toggle("dark", isDark);
}

function applyAccent(accent: Accent) {
  document.documentElement.dataset.accent = accent;
}

function applyMotion(motion: Motion) {
  document.documentElement.dataset.motion = motion;
}

function Pill({ tone, children }: { tone: "ok" | "warn" | "idle" | "bad"; children: any }) {
  return (
    <span className={["settings-pill", `settings-pill--${tone}`].join(" ")}>
      {children}
    </span>
  );
}

function Switch({
  on,
  label,
  desc,
  onToggle,
}: {
  on: boolean;
  label: string;
  desc?: string;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="settings-switch" data-on={on ? "true" : "false"} onClick={onToggle}>
      <span className="settings-switch__meta">
        <span className="settings-switch__label">{label}</span>
        {desc ? <span className="settings-switch__desc">{desc}</span> : null}
      </span>
      <span className="settings-switch__rail" aria-hidden="true">
        <span className="settings-switch__dot" />
      </span>
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="settings-seg">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={["settings-seg__btn", value === o.value ? "is-active" : ""].join(" ")}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsWorkspace({ shops, activeShopId, initial }: Props) {
  const [shopId, setShopId] = useState(activeShopId);
  const [s, setS] = useState<SettingsDTO>(() => deepClone(initial));
  const [saved, setSaved] = useState<SettingsDTO>(() => deepClone(initial));

  const [status, setStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const saveTimer = useRef<number | null>(null);

  const dirty = useMemo(() => JSON.stringify(s) !== JSON.stringify(saved), [s, saved]);

  useEffect(() => {
    // restore quick-cache if it matches current shop
    try {
      const raw = localStorage.getItem("wbp:settings");
      if (!raw) return;
      const parsed = JSON.parse(raw) as SettingsDTO;
      if (parsed?.shopId === shopId) {
        setS(parsed);
        setSaved(parsed);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setStatus(dirty ? "dirty" : "idle");
  }, [dirty]);

  useEffect(() => {
    applyTheme(s.appearance.theme);
    applyAccent(s.appearance.accent);
    applyMotion(s.appearance.motion);
  }, [s.appearance]);

  useEffect(() => {
    try {
      localStorage.setItem("wbp:settings", JSON.stringify(s));
    } catch {}
  }, [s]);

  async function loadShop(nextShopId: string) {
    setShopId(nextShopId);
    setStatus("saving");
    try {
      const res = await fetch(`/api/settings?shopId=${encodeURIComponent(nextShopId)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load settings");
      const next = json.settings as SettingsDTO;
      setS(next);
      setSaved(next);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  async function saveNow() {
    if (!dirty) return;
    setStatus("saving");
    try {
      const res = await fetch(`/api/settings?shopId=${encodeURIComponent(shopId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(s),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to save");
      const next = (json.settings || s) as SettingsDTO;
      setSaved(next);
      setS(next);
      setStatus("saved");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => setStatus("idle"), 900);
    } catch {
      setStatus("error");
    }
  }

  function reset() {
    setS(deepClone(saved));
    setStatus("idle");
  }

  return (
    <div className="settings-shell">
      <div className="settings-head wbp-card">
        <div className="settings-head__left">
          <div className="settings-title">Settings</div>
          <div className="settings-sub">Theme, navigation access, and workspace defaults.</div>
        </div>

        <div className="settings-head__right">
          {status === "saving" ? (
            <Pill tone="warn">Saving…</Pill>
          ) : status === "dirty" ? (
            <Pill tone="idle">Unsaved</Pill>
          ) : status === "saved" ? (
            <Pill tone="ok">Saved</Pill>
          ) : status === "error" ? (
            <Pill tone="bad">Error</Pill>
          ) : (
            <Pill tone="ok">Up to date</Pill>
          )}

          <button className="wbp-btn" type="button" onClick={reset} disabled={!dirty || status === "saving"}>
            Reset
          </button>
          <button
            className="wbp-btn wbp-btn-sunset"
            type="button"
            onClick={saveNow}
            disabled={!dirty || status === "saving"}
          >
            Save
          </button>
        </div>
      </div>

      <div className="settings-grid">
        <div className="settings-rail wbp-card">
          <div className="settings-rail__label">Workspace</div>

          <label className="settings-field">
            <span className="settings-field__label">Active shop</span>
            <select
              className="settings-select"
              value={shopId}
              onChange={(e) => loadShop(e.target.value)}
              disabled={status === "saving"}
            >
              {shops.map((sh) => (
                <option key={sh.id} value={sh.id}>
                  {sh.shopDomain}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span className="settings-field__label">Workspace name</span>
            <input
              className="settings-input"
              value={s.workspaceName}
              onChange={(e) => setS((p) => ({ ...p, workspaceName: e.target.value }))}
              placeholder="WBP Dashboard"
            />
          </label>

          <div className="settings-rail__hint">
            Tip: Navigation toggles below decide which pages exist for the workspace. Team & Access will later assign them per role.
          </div>
        </div>

        <div className="settings-main">
          <section className="settings-card wbp-card">
            <div className="settings-card__head">
              <div>
                <div className="settings-card__title">Appearance</div>
                <div className="settings-card__desc">Light mode readability + premium dark glass.</div>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-k">Theme</div>
              <Segmented<ThemePref>
                value={s.appearance.theme}
                options={[
                  { value: "system", label: "System" },
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
                onChange={(v) => setS((p) => ({ ...p, appearance: { ...p.appearance, theme: v } }))}
              />
            </div>

            <div className="settings-row">
              <div className="settings-k">Accent</div>
              <div className="settings-accent">
                {(["sunset", "amber", "coral", "mint", "indigo"] as Accent[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={["settings-accent__chip", s.appearance.accent === a ? "is-active" : ""].join(" ")}
                    onClick={() => setS((p) => ({ ...p, appearance: { ...p.appearance, accent: a } }))}
                    aria-label={`Accent ${a}`}
                    title={a}
                    data-accent={a}
                  />
                ))}
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-k">Density</div>
              <Segmented<Density>
                value={s.appearance.density}
                options={[
                  { value: "comfortable", label: "Comfortable" },
                  { value: "compact", label: "Compact" },
                ]}
                onChange={(v) => setS((p) => ({ ...p, appearance: { ...p.appearance, density: v } }))}
              />
            </div>

            <div className="settings-row">
              <div className="settings-k">Motion</div>
              <Segmented<Motion>
                value={s.appearance.motion}
                options={[
                  { value: "full", label: "Full" },
                  { value: "reduced", label: "Reduced" },
                ]}
                onChange={(v) => setS((p) => ({ ...p, appearance: { ...p.appearance, motion: v } }))}
              />
            </div>
          </section>

          <section className="settings-card wbp-card">
            <div className="settings-card__head">
              <div>
                <div className="settings-card__title">Navigation & Access</div>
                <div className="settings-card__desc">Enable/disable pages for this workspace (used later by Team roles).</div>
              </div>
            </div>

            <div className="settings-switches">
              <Switch
                on={s.navigation.orders}
                label="Orders"
                desc="Kanban, details drawer, status updates."
                onToggle={() => setS((p) => ({ ...p, navigation: { ...p.navigation, orders: !p.navigation.orders } }))}
              />
              <Switch
                on={s.navigation.reviews}
                label="Reviews"
                desc="Moderation lanes + counts."
                onToggle={() => setS((p) => ({ ...p, navigation: { ...p.navigation, reviews: !p.navigation.reviews } }))}
              />
              <Switch
                on={s.navigation.analytics}
                label="Analytics"
                desc="Overview graphs & KPIs."
                onToggle={() => setS((p) => ({ ...p, navigation: { ...p.navigation, analytics: !p.navigation.analytics } }))}
              />
              <Switch
                on={s.navigation.team}
                label="Team & Access"
                desc="Roles, permissions, invites (next)."
                onToggle={() => setS((p) => ({ ...p, navigation: { ...p.navigation, team: !p.navigation.team } }))}
              />
              <Switch
                on={s.navigation.trash}
                label="Trash"
                desc="Bulk restore + delete."
                onToggle={() => setS((p) => ({ ...p, navigation: { ...p.navigation, trash: !p.navigation.trash } }))}
              />
            </div>

            <div className="settings-note">
              Settings stays always enabled (can’t be turned off).
            </div>
          </section>

          <section className="settings-card wbp-card">
            <div className="settings-card__head">
              <div>
                <div className="settings-card__title">Notifications</div>
                <div className="settings-card__desc">Clean defaults now, deeper routing later.</div>
              </div>
            </div>

            <div className="settings-switches">
              <Switch
                on={s.notifications.newOrder}
                label="New order"
                desc="Notify when a request arrives."
                onToggle={() => setS((p) => ({ ...p, notifications: { ...p.notifications, newOrder: !p.notifications.newOrder } }))}
              />
              <Switch
                on={s.notifications.newReview}
                label="New review"
                desc="Notify when a review needs moderation."
                onToggle={() => setS((p) => ({ ...p, notifications: { ...p.notifications, newReview: !p.notifications.newReview } }))}
              />
              <Switch
                on={s.notifications.dailyDigest}
                label="Daily digest"
                desc="Daily summary (email / dashboard)."
                onToggle={() => setS((p) => ({ ...p, notifications: { ...p.notifications, dailyDigest: !p.notifications.dailyDigest } }))}
              />
            </div>
          </section>

          <section className="settings-card wbp-card">
            <div className="settings-card__head">
              <div>
                <div className="settings-card__title">Security</div>
                <div className="settings-card__desc">Session timeout + optional 2FA (policy-ready).</div>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-k">Session timeout</div>
              <select
                className="settings-select"
                value={String(s.security.sessionTimeoutMins)}
                onChange={(e) =>
                  setS((p) => ({ ...p, security: { ...p.security, sessionTimeoutMins: Number(e.target.value) } }))
                }
              >
                <option value="60">1 hour</option>
                <option value="240">4 hours</option>
                <option value="720">12 hours</option>
                <option value="1440">24 hours</option>
              </select>
            </div>

            <div className="settings-switches">
              <Switch
                on={s.security.require2fa}
                label="Require 2FA"
                desc="Recommended for admin accounts."
                onToggle={() => setS((p) => ({ ...p, security: { ...p.security, require2fa: !p.security.require2fa } }))}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
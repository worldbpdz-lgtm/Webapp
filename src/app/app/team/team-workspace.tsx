// src/app/app/team/team-workspace.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { TeamMember, ViewerPerms } from "./team-types";

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

const DEFAULT_PERMS: ViewerPerms = {
  pages: { orders: true, reviews: true, analytics: true, team: false, trash: true },
  orders: { confirm: false, decline: false, moveToReview: false, archive: false },
  reviews: { approve: false, reject: false, edit: false, delete: false },
  trash: { restore: true, hardDelete: false, bulk: true },
  analytics: { view: true },
  team: { view: false, manage: false },
};

const ROLE_PRESETS: Record<string, ViewerPerms> = {
  owner: {
    pages: { orders: true, reviews: true, analytics: true, team: true, trash: true },
    orders: { confirm: true, decline: true, moveToReview: true, archive: true },
    reviews: { approve: true, reject: true, edit: true, delete: true },
    trash: { restore: true, hardDelete: true, bulk: true },
    analytics: { view: true },
    team: { view: true, manage: true },
  },
  admin: {
    pages: { orders: true, reviews: true, analytics: true, team: true, trash: true },
    orders: { confirm: true, decline: true, moveToReview: true, archive: true },
    reviews: { approve: true, reject: true, edit: true, delete: false },
    trash: { restore: true, hardDelete: false, bulk: true },
    analytics: { view: true },
    team: { view: true, manage: true },
  },
  staff: DEFAULT_PERMS,
};

function normalizePerms(p?: ViewerPerms): ViewerPerms {
  const base = deepClone(DEFAULT_PERMS);
  const src = p || {};
  return {
    pages: { ...base.pages, ...src.pages },
    orders: { ...base.orders, ...src.orders },
    reviews: { ...base.reviews, ...src.reviews },
    trash: { ...base.trash, ...src.trash },
    analytics: { ...base.analytics, ...src.analytics },
    team: { ...base.team, ...src.team },
    settings: { ...(base as any).settings, ...(src as any).settings },
  };
}

function initials(nameOrEmail: string) {
  const t = (nameOrEmail || "").trim();
  if (!t) return "??";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return t.slice(0, 2).toUpperCase();
}

function Pill({ children, accent }: { children: any; accent: "ok" | "warn" | "bad" | "neutral" }) {
  return (
    <span className="team-pill" data-accent={accent}>
      {children}
    </span>
  );
}

function Switch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="team-switch"
      data-on={checked ? "true" : "false"}
      data-disabled={disabled ? "true" : "false"}
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}
    >
      <span className="team-switch__track" />
      <span className="team-switch__dot" />
    </button>
  );
}

function countEnabledPages(perms: ViewerPerms) {
  const p = normalizePerms(perms).pages || {};
  return Object.values(p).filter(Boolean).length;
}

function pagesBadges(perms: ViewerPerms) {
  const p = normalizePerms(perms).pages || {};
  const out: Array<{ k: string; label: string }> = [];
  if (p.orders) out.push({ k: "orders", label: "Orders" });
  if (p.reviews) out.push({ k: "reviews", label: "Reviews" });
  if (p.analytics) out.push({ k: "analytics", label: "Analytics" });
  if (p.trash) out.push({ k: "trash", label: "Trash" });
  if (p.team) out.push({ k: "team", label: "Team" });
  return out.slice(0, 3);
}

export default function TeamWorkspace({
  shopId,
  shopDomain,
  initialMembers,
  canManage,
  schemaMissing,
  schemaHint,
}: {
  shopId: string;
  shopDomain: string;
  initialMembers: TeamMember[];
  canManage: boolean;
  schemaMissing: boolean;
  schemaHint: string | null;
}) {
  const sp = useSearchParams();
  const q = (sp.get("q") ?? sp.get("search") ?? "").trim().toLowerCase();

  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [selectedId, setSelectedId] = useState<string | null>(initialMembers?.[0]?.id ?? null);
  const [busy, setBusy] = useState(false);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"owner" | "admin" | "staff">("staff");

  const selected = useMemo(
    () => members.find((m) => m.id === selectedId) ?? null,
    [members, selectedId]
  );

  // ✅ Topbar search filtering (client-side)
  const visibleMembers = useMemo(() => {
    if (!q) return members;
    return members.filter((m) => {
      const hay = [m.email, m.name ?? "", m.role, m.id].join(" | ").toLowerCase();
      return hay.includes(q);
    });
  }, [members, q]);

  useEffect(() => {
    if (selectedId && members.some((m) => m.id === selectedId)) return;
    setSelectedId(members?.[0]?.id ?? null);
  }, [members, selectedId]);

  async function refresh() {
    setBusy(true);
    try {
      const res = await fetch(`/api/team/members?shopId=${encodeURIComponent(shopId)}`, { method: "GET" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(json.members)) {
        setMembers(json.members);
        if (!selectedId && json.members?.[0]?.id) setSelectedId(json.members[0].id);
      }
    } finally {
      setBusy(false);
    }
  }

  async function createMember() {
    if (!canManage) return;
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;

    setBusy(true);
    try {
      const preset = normalizePerms(ROLE_PRESETS[newRole] ?? DEFAULT_PERMS);

      const res = await fetch(`/api/team/members?shopId=${encodeURIComponent(shopId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          name: newName.trim() || null,
          role: newRole,
          perms: preset,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) return;

      if (json.member) {
        setMembers((prev) => [json.member, ...prev.filter((m) => m.id !== json.member.id)]);
        setSelectedId(json.member.id);
      } else {
        await refresh();
      }

      setCreateOpen(false);
      setNewEmail("");
      setNewName("");
      setNewRole("staff");
    } finally {
      setBusy(false);
    }
  }

  async function saveMember(next: TeamMember) {
    if (!canManage) return;
    setBusy(true);

    setMembers((prev) => prev.map((m) => (m.id === next.id ? next : m)));

    try {
      const res = await fetch(
        `/api/team/members/${encodeURIComponent(next.id)}?shopId=${encodeURIComponent(shopId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: next.name,
            role: next.role,
            perms: normalizePerms(next.perms),
          }),
        }
      );

      if (!res.ok) {
        await refresh();
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (json.member) setMembers((prev) => prev.map((m) => (m.id === next.id ? json.member : m)));
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(id: string) {
    if (!canManage) return;
    const ok = window.confirm("Remove this team member? They will lose access immediately.");
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/team/members/${encodeURIComponent(id)}?shopId=${encodeURIComponent(shopId)}`, {
        method: "DELETE",
      });

      if (!res.ok) return;

      setMembers((prev) => prev.filter((m) => m.id !== id));
      if (selectedId === id) setSelectedId(null);
    } finally {
      setBusy(false);
    }
  }

  function setPerm(path: string, value: boolean) {
    if (!selected) return;
    const next = deepClone(selected);
    next.perms = normalizePerms(next.perms);

    const [group, key] = path.split(".");
    (next.perms as any)[group] = { ...(next.perms as any)[group], [key]: value };

    if (group === "pages" && key === "team" && value === false) {
      next.perms.team = { view: false, manage: false };
    }

    saveMember(next);
  }

  function setRole(role: string) {
    if (!selected) return;
    const next = deepClone(selected);
    next.role = role;
    next.perms = normalizePerms(ROLE_PRESETS[role] ?? next.perms);
    saveMember(next);
  }

  function setName(name: string) {
    if (!selected) return;
    const next = deepClone(selected);
    next.name = name;
    saveMember(next);
  }

  const badgeAccent = (role: string) => {
    if (role === "owner") return "ok";
    if (role === "admin") return "warn";
    return "neutral";
  };

  return (
    <div className="team-shell">
      <div className="team-hero wbp-card wbp-surface">
        <div className="team-hero__left">
          <div className="team-hero__titleRow">
            <div className="team-hero__title">Team & Access</div>
            {busy ? <span className="team-dotPulse" aria-label="Saving" /> : null}
          </div>
          <div className="team-hero__sub">
            Manage who can access pages and which actions they can perform — per shop.
          </div>

          <div className="team-hero__chips">
            <span className="team-chip">
              <span className="team-chip__k">Shop</span>
              <span className="team-chip__v">{shopDomain}</span>
            </span>
            <span className="team-chip">
              <span className="team-chip__k">Members</span>
              <span className="team-chip__v">{members.length}</span>
            </span>
            <span className="team-chip">
              <span className="team-chip__k">Mode</span>
              <span className="team-chip__v">{canManage ? "Editable" : "Read-only"}</span>
            </span>
          </div>
        </div>

        <div className="team-hero__right">
          {canManage ? (
            <button
              className="orders-btn orders-btn--ok"
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={busy}
            >
              Add member
            </button>
          ) : (
            <Pill accent="neutral">Read-only</Pill>
          )}
        </div>
      </div>

      {schemaMissing ? (
        <div className="team-banner wbp-card" data-accent="bad">
          <div className="team-banner__title">Team DB schema missing</div>
          <div className="team-banner__sub">{schemaHint ?? "Add the Viewer model and migrate, then refresh."}</div>
        </div>
      ) : null}

      <div className="team-grid">
        {/* Left: members list (no search bar) */}
        <div className="team-list wbp-card wbp-surface">
          <div className="team-list__top">
            <div className="team-list__title">
              Members <span className="team-list__count">{members.length}</span>
            </div>
            <div className="team-list__hint">
              {q ? `Searching “${q}”` : "Click a person to edit access"}
            </div>
          </div>

          <div className="team-list__items">
            {visibleMembers.map((m) => {
              const active = m.id === selectedId;
              const pageCount = countEnabledPages(m.perms);
              const badges = pagesBadges(m.perms);

              return (
                <button
                  key={m.id}
                  type="button"
                  className="team-member"
                  data-active={active ? "true" : "false"}
                  data-role={m.role}
                  onClick={() => setSelectedId(m.id)}
                >
                  <div className="team-member__avatar" aria-hidden="true">
                    {initials(m.name || m.email)}
                  </div>

                  <div className="team-member__main">
                    <div className="team-member__row">
                      <div className="team-member__name">{m.name || m.email.split("@")[0]}</div>
                      <Pill accent={badgeAccent(m.role) as any}>{m.role}</Pill>
                    </div>

                    <div className="team-member__email">{m.email}</div>

                    <div className="team-member__meta">
                      <span className="team-miniStat">
                        <span className="team-miniStat__k">Pages</span>
                        <span className="team-miniStat__v">{pageCount}</span>
                      </span>
                      <div className="team-miniBadges" aria-hidden="true">
                        {badges.map((b) => (
                          <span key={b.k} className="team-miniBadge">
                            {b.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}

            {members.length === 0 ? (
              <div className="team-empty">
                <div className="team-empty__t">No members yet</div>
                <div className="team-empty__s">{canManage ? "Add your first staff member." : "Ask an admin to add you."}</div>
              </div>
            ) : null}

            {members.length > 0 && visibleMembers.length === 0 ? (
              <div className="team-empty">
                <div className="team-empty__t">No matches</div>
                <div className="team-empty__s">Try a different keyword in the top search.</div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Right: editor */}
        <div className="team-panel wbp-card wbp-surface">
          {!selected ? (
            <div className="team-empty">
              <div className="team-empty__t">Select a member</div>
              <div className="team-empty__s">Pick someone on the left to edit access.</div>
            </div>
          ) : (
            <>
              <div className="team-panel__head">
                <div className="team-panel__who">
                  <div className="team-panel__avatar">{initials(selected.name || selected.email)}</div>
                  <div className="team-panel__whoText">
                    <div className="team-panel__name">{selected.name || selected.email.split("@")[0]}</div>
                    <div className="team-panel__email">{selected.email}</div>
                  </div>
                </div>

                <div className="team-panel__actions">
                  <Pill accent={canManage ? "warn" : "neutral"}>{canManage ? "Editable" : "Locked"}</Pill>

                  {canManage ? (
                    <button
                      className="team-iconDanger"
                      type="button"
                      onClick={() => removeMember(selected.id)}
                      disabled={busy}
                      title="Remove member"
                      aria-label="Remove member"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Role preset */}
              <div className="team-section">
                <div className="team-section__top">
                  <div>
                    <div className="team-section__title">Role preset</div>
                    <div className="team-section__sub">Choose a preset, then fine-tune permissions below.</div>
                  </div>
                </div>

                <div className="team-roleCards">
                  {(["staff", "admin", "owner"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      className="team-roleCard"
                      data-active={selected.role === r ? "true" : "false"}
                      onClick={() => setRole(r)}
                      disabled={!canManage || busy}
                    >
                      <div className="team-roleCard__top">
                        <div className="team-roleCard__name">{r}</div>
                        <span className="team-roleCard__dot" data-role={r} />
                      </div>
                      <div className="team-roleCard__sub">
                        {r === "staff"
                          ? "Limited access, safest default."
                          : r === "admin"
                          ? "Full ops access, limited destructive actions."
                          : "Everything enabled (highest trust)."}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="team-fieldRow">
                  <div className="team-field">
                    <div className="team-field__k">Display name</div>
                    <input
                      className="team-field__input"
                      value={selected.name ?? ""}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Optional (e.g. Sarah)"
                      disabled={!canManage || busy}
                    />
                  </div>
                </div>
              </div>

              {/* Permissions */}
              <div className="team-permGrid">
                <div className="team-permCard">
                  <div className="team-permCard__head">
                    <div className="team-permCard__title">Pages</div>
                    <div className="team-permCard__sub">Control what appears in the sidebar.</div>
                  </div>

                  <div className="team-matrix">
                    {[
                      ["pages.orders", "Orders", "View and manage requests board"],
                      ["pages.reviews", "Reviews", "Access reviews workflow"],
                      ["pages.analytics", "Analytics", "See performance dashboards"],
                      ["pages.trash", "Trash", "See archived items and restore"],
                      ["pages.team", "Team & Access", "Open team page (required for staff)"],
                    ].map(([key, label, desc]) => {
                      const [g, k] = key.split(".");
                      const checked = !!(normalizePerms(selected.perms) as any)[g]?.[k];
                      return (
                        <div className="team-row team-row--rich" key={key}>
                          <div className="team-row__left">
                            <div className="team-row__label">{label}</div>
                            <div className="team-row__desc">{desc}</div>
                          </div>
                          <Switch checked={checked} disabled={!canManage || busy} onChange={(v) => setPerm(key, v)} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="team-permCard">
                  <div className="team-permCard__head">
                    <div className="team-permCard__title">Orders actions</div>
                    <div className="team-permCard__sub">Granular actions inside the Orders board.</div>
                  </div>

                  <div className="team-matrix">
                    {[
                      ["orders.confirm", "Confirm orders", "Approve and confirm a request"],
                      ["orders.decline", "Decline orders", "Reject a request"],
                      ["orders.moveToReview", "Move to In Review", "Send back to review lane"],
                      ["orders.archive", "Move to Trash", "Archive an order to Trash"],
                    ].map(([key, label, desc]) => {
                      const [g, k] = key.split(".");
                      const checked = !!(normalizePerms(selected.perms) as any)[g]?.[k];
                      return (
                        <div className="team-row team-row--rich" key={key}>
                          <div className="team-row__left">
                            <div className="team-row__label">{label}</div>
                            <div className="team-row__desc">{desc}</div>
                          </div>
                          <Switch checked={checked} disabled={!canManage || busy} onChange={(v) => setPerm(key, v)} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="team-permCard">
                  <div className="team-permCard__head">
                    <div className="team-permCard__title">Trash actions</div>
                    <div className="team-permCard__sub">Restore and delete controls in Trash.</div>
                  </div>

                  <div className="team-matrix">
                    {[
                      ["trash.restore", "Restore from Trash", "Bring items back to active lanes"],
                      ["trash.bulk", "Bulk select actions", "Select multiple items at once"],
                      ["trash.hardDelete", "Delete permanently", "Irreversible delete"],
                    ].map(([key, label, desc]) => {
                      const [g, k] = key.split(".");
                      const checked = !!(normalizePerms(selected.perms) as any)[g]?.[k];
                      return (
                        <div className="team-row team-row--rich" key={key}>
                          <div className="team-row__left">
                            <div className="team-row__label">{label}</div>
                            <div className="team-row__desc">{desc}</div>
                          </div>
                          <Switch checked={checked} disabled={!canManage || busy} onChange={(v) => setPerm(key, v)} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="team-permCard">
                  <div className="team-permCard__head">
                    <div className="team-permCard__title">Team permissions</div>
                    <div className="team-permCard__sub">Who can view/manage members.</div>
                  </div>

                  <div className="team-matrix">
                    {[
                      ["team.view", "View Team page", "Open Team & Access page"],
                      ["team.manage", "Manage Team", "Add/edit/remove members"],
                    ].map(([key, label, desc]) => {
                      const [g, k] = key.split(".");
                      const checked = !!(normalizePerms(selected.perms) as any)[g]?.[k];
                      return (
                        <div className="team-row team-row--rich" key={key}>
                          <div className="team-row__left">
                            <div className="team-row__label">{label}</div>
                            <div className="team-row__desc">{desc}</div>
                          </div>
                          <Switch checked={checked} disabled={!canManage || busy} onChange={(v) => setPerm(key, v)} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="team-footNote">
                Tell the employee to <strong>sign up/login using the same email</strong>. Once they log in, access applies automatically.
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create member modal */}
      {createOpen ? (
        <div className="team-modalBackdrop" onMouseDown={() => setCreateOpen(false)}>
          <div className="team-modal wbp-card" onMouseDown={(e) => e.stopPropagation()}>
            <div className="team-modal__top">
              <div>
                <div className="team-modal__title">Add team member</div>
                <div className="team-modal__sub">They must sign up/login using this email.</div>
              </div>
              <button
                type="button"
                className="team-iconDanger"
                onClick={() => setCreateOpen(false)}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="team-modal__grid">
              <div className="team-field">
                <div className="team-field__k">Email</div>
                <input
                  className="team-field__input"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="name@company.com"
                  disabled={busy}
                />
              </div>

              <div className="team-field">
                <div className="team-field__k">Name (optional)</div>
                <input
                  className="team-field__input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Sarah"
                  disabled={busy}
                />
              </div>

              <div className="team-field">
                <div className="team-field__k">Role preset</div>
                <div className="team-roleCards team-roleCards--modal">
                  {(["staff", "admin", "owner"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      className="team-roleCard"
                      data-active={newRole === r ? "true" : "false"}
                      onClick={() => setNewRole(r)}
                      disabled={busy}
                    >
                      <div className="team-roleCard__top">
                        <div className="team-roleCard__name">{r}</div>
                        <span className="team-roleCard__dot" data-role={r} />
                      </div>
                      <div className="team-roleCard__sub">
                        {r === "staff" ? "Limited access." : r === "admin" ? "Operations access." : "Full access."}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="team-modal__actions">
              <button className="orders-btn" type="button" onClick={() => setCreateOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button className="orders-btn orders-btn--ok" type="button" onClick={createMember} disabled={busy}>
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
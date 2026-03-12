// src/app/app/trash/trash-client.tsx
"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePermissions } from "@/components/shell/permissions-context";

type Row = {
  id: string;
  createdAt: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  roleType: string | null;
  prevStatus: string | null;
};

function restoreTarget(prevStatus: string | null) {
  const s = (prevStatus || "").trim();
  if (s === "confirmed") return "confirmed";
  if (s === "cancelled") return "cancelled";
  return "in_review";
}

export default function TrashClient({
  initialRows,
  shopId,
}: {
  initialRows: Row[];
  shopId: string;
}) {
  const perms = usePermissions();
  const canRestore = !!perms?.trash?.restore;
  const canHardDelete = !!perms?.trash?.hardDelete;
  const canBulk = !!perms?.trash?.bulk;

  const sp = useSearchParams();
  const q = (sp?.get("q") || "").trim().toLowerCase();

  const [rows, setRows] = useState<Row[]>(initialRows);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    if (!q) return rows;
    return rows.filter((r) => {
      const name =
        `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() ||
        r.email ||
        r.phone ||
        "Customer";

      const hay = [
        r.id,
        name,
        r.email ?? "",
        r.phone ?? "",
        String(r.roleType ?? ""),
        r.createdAt,
        new Date(r.createdAt).toLocaleString(),
      ]
        .join(" | ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [rows, q]);

  const visibleIds = useMemo(() => visible.map((r) => r.id), [visible]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const anySelected = selected.size > 0;

  function toggleOne(id: string) {
    if (!canBulk) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    if (!canBulk) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  async function restoreMany(ids: string[]) {
    if (!canRestore) return;
    if (!ids.length) return;

    setBusy(true);

    await Promise.all(
      ids.map((id) => {
        const row = rows.find((r) => r.id === id);
        const target = restoreTarget(row?.prevStatus ?? null);

        return fetch(`/api/requests/${id}/status?shopId=${encodeURIComponent(shopId)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: target }),
        });
      })
    );

    setRows((x) => x.filter((r) => !ids.includes(r.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });

    setBusy(false);
  }

  async function deleteMany(ids: string[]) {
    if (!canHardDelete) return;
    if (!ids.length) return;

    const ok = window.confirm(
      ids.length === 1
        ? "Delete this request permanently? This cannot be undone."
        : `Delete ${ids.length} requests permanently? This cannot be undone.`
    );
    if (!ok) return;

    setBusy(true);

    await Promise.all(
      ids.map((id) =>
        fetch(`/api/requests/${id}/delete?shopId=${encodeURIComponent(shopId)}`, {
          method: "DELETE",
        })
      )
    );

    setRows((x) => x.filter((r) => !ids.includes(r.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });

    setBusy(false);
  }

  if (rows.length === 0) return <div className="wbp-muted">Trash is empty.</div>;

  const showBulkBar = canBulk && (canRestore || canHardDelete);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Bulk actions bar */}
      {showBulkBar ? (
        <div
          className="wbp-glass wbp-card"
          style={{
            padding: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 10, userSelect: "none" }}>
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              disabled={busy || visibleIds.length === 0}
            />
            <span style={{ fontWeight: 950 }}>Select</span>
            <span className="wbp-muted">{selected.size} selected</span>
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {canRestore ? (
              <button
                className="orders-btn orders-btn--ok"
                type="button"
                disabled={!anySelected || busy}
                onClick={() => restoreMany(Array.from(selected))}
              >
                Restore selected
              </button>
            ) : null}

            {canHardDelete ? (
              <button
                className="orders-btn orders-btn--danger"
                type="button"
                disabled={!anySelected || busy}
                onClick={() => deleteMany(Array.from(selected))}
              >
                Delete selected
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Cards styled like Orders */}
      <div className="orders-grid">
        {visible.map((r) => {
          const name =
            `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() ||
            r.email ||
            r.phone ||
            "Customer";

          const checked = selected.has(r.id);

          return (
            <div key={r.id} className="orders-card wbp-card" data-accent="warn">
              <div className="orders-card__head" style={{ gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  {canBulk ? (
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(r.id)}
                      disabled={busy}
                    />
                  ) : null}

                  <div className="orders-card__name" style={{ minWidth: 0 }}>
                    {name}
                  </div>
                </div>

                <div className="orders-pill orders-pill--ping" data-accent="warn">
                  Trash
                </div>
              </div>

              <div className="orders-card__row">
                <span className="orders-muted">#{r.id.slice(0, 10)}…</span>
                <span className="orders-dot">•</span>
                <span className="orders-muted">{new Date(r.createdAt).toLocaleString()}</span>
              </div>

              <div className="orders-card__row orders-card__row--bottom">
                <span className="orders-muted">{String(r.roleType ?? "—")}</span>
                <span className="orders-dot">•</span>
                <span className="orders-muted">{r.email ?? r.phone ?? "—"}</span>
              </div>

              {(canRestore || canHardDelete) ? (
                <div className="orders-card__actions" onClick={(e) => e.stopPropagation()}>
                  {canRestore ? (
                    <button
                      className="orders-btn orders-btn--ok"
                      onClick={() => restoreMany([r.id])}
                      disabled={busy}
                      type="button"
                    >
                      Restore
                    </button>
                  ) : null}

                  {canHardDelete ? (
                    <button
                      className="orders-btn orders-btn--danger"
                      onClick={() => deleteMany([r.id])}
                      disabled={busy}
                      type="button"
                    >
                      Delete permanently
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="orders-empty wbp-card">
          <div className="orders-empty__title">Nothing found</div>
          <div className="orders-empty__sub">No matches for your search.</div>
        </div>
      ) : null}
    </div>
  );
}
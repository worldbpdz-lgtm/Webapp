"use client";

import Link from "next/link";
import React, { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReviewsDrawer from "./reviews-drawer";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DragCancelEvent,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Status = "pending" | "approved" | "trash";
type DbStatus = "pending" | "approved" | "trashed";

type Review = {
  id: string;
  shopDomain: string;
  productId: string;
  productHandle: string | null;
  productTitle?: string | null;

  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  authorLastName: string | null;
  authorEmail: string | null;
  mediaUrl: string | null;
  status: "pending" | "approved" | "trashed";
  createdAt: string;
  updatedAt: string;
};

type Counts = { pending: number; approved: number; trash: number };

function displayName(r: Review) {
  if (r.authorLastName && r.authorLastName.length > 0) return `${r.authorName} ${r.authorLastName[0]}.`;
  return r.authorName;
}

function pillLabel(status: Status) {
  if (status === "pending") return "Pending";
  if (status === "approved") return "Approved";
  return "Trash";
}

function accentForStatus(status: Status) {
  if (status === "approved") return "ok";
  if (status === "trash") return "danger";
  return "bad";
}

function toDbStatus(status: Status): DbStatus {
  return status === "trash" ? "trashed" : status;
}

function Stars({ rating }: { rating: number }) {
  const full = Math.max(0, Math.min(5, Math.floor(rating)));
  return (
    <span className="reviews-stars" aria-label={`${full} out of 5 stars`}>
      {"★★★★★".slice(0, full)}
      <span className="reviews-stars--dim">{"★★★★★".slice(0, 5 - full)}</span>
    </span>
  );
}

function humanizeHandle(handle: string) {
  const s = String(handle || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return handle;
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function productName(r: Review) {
  const t = (r.productTitle ?? "").trim();
  if (t) return t;
  const h = (r.productHandle ?? "").trim();
  if (h) return humanizeHandle(h);
  return `Product #${r.productId}`;
}

/** --- Remember last non-trash status for Restore --- */
function prevKey(shopDomain: string) {
  return `wbp-review-prev:${shopDomain}`;
}
function loadPrev(shopDomain: string): Record<string, Status> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(prevKey(shopDomain)) || "{}") || {};
  } catch {
    return {};
  }
}
function savePrev(shopDomain: string, map: Record<string, Status>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(prevKey(shopDomain), JSON.stringify(map));
}
function rememberPrev(shopDomain: string, id: string, from: Status) {
  if (from === "trash") return;
  const map = loadPrev(shopDomain);
  map[id] = from;
  savePrev(shopDomain, map);
}
function consumePrev(shopDomain: string, id: string): Status | null {
  const map = loadPrev(shopDomain);
  const v = map[id];
  if (!v) return null;
  delete map[id];
  savePrev(shopDomain, map);
  return v;
}
function peekPrev(shopDomain: string, id: string): Status | null {
  const map = loadPrev(shopDomain);
  return map[id] || null;
}

function DockZone({ id, label, accent }: { id: string; label: string; accent: "ok" | "bad" | "warn" }) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: { type: "dock" },
  });

  return (
    <div ref={setNodeRef} className="orders-dock__zone" data-accent={accent} data-over={isOver ? "true" : "false"}>
      <div className="orders-dock__label">{label}</div>
    </div>
  );
}

function ReviewCard({
  r,
  lane,
  shopDomain,
  onOpen,
  onApprove,
  onReject,
  onToPending,
  onRestoreLast,
  onDelete,
  busy,
  recentlyDraggedRef,
}: {
  r: Review;
  lane: Status;
  shopDomain: string;

  onOpen: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onToPending: (id: string) => void;
  onRestoreLast: (id: string) => void;
  onDelete: (id: string) => void;

  busy: boolean;
  recentlyDraggedRef: React.MutableRefObject<boolean>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: r.id,
    data: { type: "card", review: r },
    disabled: busy,
  });

  // ✅ hide the original card while dragging (so only overlay is visible)
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  const adminProductUrl = `https://${shopDomain}/admin/products/${r.productId}`;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className="orders-card wbp-card reviews-card"
      data-accent={accentForStatus(lane)}
      data-dragging={isDragging ? "true" : "false"}
      data-busy={busy ? "true" : "false"}
      // ✅ drag from entire card
      {...attributes}
      {...listeners}
      onClick={() => {
        if (recentlyDraggedRef.current) return;
        onOpen(r.id);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen(r.id);
      }}
    >
      <div className="reviews-card__top">
        <div style={{ minWidth: 0 }}>
          <div className="reviews-card__line">
            <div className="reviews-name">{displayName(r)}</div>
            <Stars rating={r.rating} />
          </div>

          <div className="reviews-meta">
            <a
              className="reviews-link"
              href={adminProductUrl}
              target="_blank"
              rel="noreferrer"
              // ✅ stop drag when clicking link
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              title="Open product in Shopify Admin"
            >
              {productName(r)}
            </a>

            <span className="reviews-dim"> • #{r.productId}</span>
            {r.productHandle ? <span className="reviews-dim"> • {r.productHandle}</span> : null}

            <span className="reviews-dot">•</span>
            <span className="reviews-dim">{new Date(r.createdAt).toLocaleString()}</span>
          </div>
        </div>

        <span className="orders-card__state">{pillLabel(lane)}</span>
      </div>

      {r.title ? <div className="reviews-titleLine">{r.title}</div> : null}
      <div className="reviews-body">{r.body}</div>

      {r.mediaUrl ? (
        <div className="reviews-media">
          <img src={r.mediaUrl} alt="Review media" loading="lazy" onPointerDown={(e) => e.stopPropagation()} />
        </div>
      ) : null}

      {/* ✅ buttons: stop pointerdown so dragging doesn't start from buttons */}
      <div className="reviews-actions" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        {lane === "pending" && (
          <>
            <button className="orders-btn orders-btn--ok" disabled={busy} onClick={() => onApprove(r.id)} type="button">
              Approve
            </button>
            <button className="orders-btn orders-btn--danger" disabled={busy} onClick={() => onReject(r.id)} type="button">
              Reject
            </button>
          </>
        )}

        {lane === "approved" && (
          <>
            <button className="orders-btn orders-btn--ok" disabled={busy} onClick={() => onToPending(r.id)} type="button">
              Move to Pending
            </button>
            <button className="orders-btn orders-btn--danger" disabled={busy} onClick={() => onReject(r.id)} type="button">
              Reject
            </button>
          </>
        )}

        {lane === "trash" && (
          <>
            <button className="orders-btn orders-btn--ok" disabled={busy} onClick={() => onRestoreLast(r.id)} type="button">
              Restore
            </button>
            <button className="orders-btn orders-btn--danger" disabled={busy} onClick={() => onDelete(r.id)} type="button">
              Delete permanently
            </button>
          </>
        )}
      </div>
    </article>
  );
}

// ✅ same collision trick as Orders (dock only if pointer is inside it)
const collisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length) return pointerHits;

  const cardsOnly = args.droppableContainers.filter((c) => c.data?.current?.type === "card");
  return closestCenter({ ...args, droppableContainers: cardsOnly });
};

export default function ReviewsWorkspace({
  shopId,
  shopDomain,
  initialStatus,
  initialReviews,
  initialError,
  initialCounts,
}: {
  shopId: string;
  shopDomain: string;
  initialStatus: Status;
  initialReviews: Review[];
  initialError: string | null;
  initialCounts?: Counts;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const q = (sp.get("q") ?? sp.get("search") ?? "").trim().toLowerCase();

  const [items, setItems] = useState<Review[]>(initialReviews);
  const [counts, setCounts] = useState<Counts>(initialCounts ?? { pending: 0, approved: 0, trash: 0 });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(initialError);
  const [openId, setOpenId] = useState<string | null>(null);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const recentlyDraggedRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const visible = useMemo(() => {
    if (!q) return items;
    return items.filter((r) => {
      const hay = [
        r.authorName,
        r.authorLastName ?? "",
        r.authorEmail ?? "",
        r.title ?? "",
        r.body,
        r.productTitle ?? "",
        r.productHandle ?? "",
        r.productId,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, q]);

  const byId = useMemo(() => {
    const m = new Map<string, Review>();
    items.forEach((r) => m.set(r.id, r));
    return m;
  }, [items]);

  const overlayReview = draggingId ? byId.get(draggingId) ?? null : null;

  const activeReview = useMemo(
    () => (openId ? items.find((r) => r.id === openId) ?? null : null),
    [openId, items]
  );

  function markRecentlyDragged() {
    recentlyDraggedRef.current = true;
    window.setTimeout(() => (recentlyDraggedRef.current = false), 260);
  }

  function bumpCounts(from: Status, to: Status) {
    if (from === to) return;
    setCounts((prev) => ({
      ...prev,
      [from]: Math.max(0, prev[from] - 1),
      [to]: prev[to] + 1,
    }));
  }

  async function patchStatus(id: string, next: Status) {
    setNotice(null);
    setBusyId(id);

    try {
      const res = await fetch(`/api/reviews/${encodeURIComponent(id)}?shopDomain=${encodeURIComponent(shopDomain)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: toDbStatus(next) }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        let msg = "Failed to update review.";
        try {
          const j = JSON.parse(t || "{}");
          msg = j?.error || msg;
        } catch {
          if (t) msg = t;
        }
        setNotice(msg);
        return false;
      }

      setItems((prev) => prev.filter((r) => r.id !== id));
      bumpCounts(initialStatus, next);
      if (openId === id) setOpenId(null);
      return true;
    } catch (e: any) {
      setNotice(e?.message || "Failed to update review.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function hardDelete(id: string) {
    setNotice(null);
    const ok = window.confirm("Delete this review permanently? This cannot be undone.");
    if (!ok) return false;

    setBusyId(id);

    try {
      const res = await fetch(`/api/reviews/${encodeURIComponent(id)}?shopDomain=${encodeURIComponent(shopDomain)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        let msg = "Failed to delete review.";
        try {
          const j = JSON.parse(t || "{}");
          msg = j?.error || msg;
        } catch {
          if (t) msg = t;
        }
        setNotice(msg);
        return false;
      }

      setItems((prev) => prev.filter((r) => r.id !== id));
      setCounts((prev) => ({ ...prev, trash: Math.max(0, prev.trash - 1) }));
      if (openId === id) setOpenId(null);
      return true;
    } catch (e: any) {
      setNotice(e?.message || "Failed to delete review.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  // actions
  const approve = (id: string) => void patchStatus(id, "approved");

  const toPending = (id: string) => void patchStatus(id, "pending");

  const reject = (id: string) => {
    // ✅ remember where it came from so Restore returns correctly
    rememberPrev(shopDomain, id, initialStatus);
    void patchStatus(id, "trash");
  };

  const restoreLast = async (id: string) => {
    // prefer stored prev status; fallback pending
    const prev = peekPrev(shopDomain, id) || "pending";
    const ok = await patchStatus(id, prev);
    if (ok) consumePrev(shopDomain, id);
  };

  const del = (id: string) => void hardDelete(id);

  // ✅ exactly 2 boxes on every page
  const dockTargets = useMemo(() => {
    if (initialStatus === "pending") {
      return [
        { id: "dock:ok", label: "Approve", accent: "ok" as const, act: approve },
        { id: "dock:bad", label: "Reject", accent: "bad" as const, act: reject },
      ];
    }

    if (initialStatus === "approved") {
      return [
        { id: "dock:warn", label: "Pending", accent: "warn" as const, act: toPending },
        { id: "dock:bad", label: "Reject", accent: "bad" as const, act: reject },
      ];
    }

    // trash
    return [
      { id: "dock:warn", label: "Pending", accent: "warn" as const, act: toPending },
      { id: "dock:ok", label: "Approved", accent: "ok" as const, act: approve },
    ];
  }, [initialStatus]);

  function onDragStart(e: DragStartEvent) {
    setDraggingId(String(e.active.id));
  }

  function onDragCancel(_e: DragCancelEvent) {
    setDraggingId(null);
    markRecentlyDragged();
  }

  async function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    setDraggingId(null);
    markRecentlyDragged();

    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;

    if (overId.startsWith("dock:")) {
      const target = dockTargets.find((t) => t.id === overId);
      if (target) target.act(id);
      return;
    }

    // no reorder while searching
    if (q) return;

    setItems((prev) => {
      const oldIndex = prev.findIndex((x) => x.id === id);
      const newIndex = prev.findIndex((x) => x.id === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  const tabs: Array<{ href: string; key: Status }> = [
    { href: "/app/reviews/pending", key: "pending" },
    { href: "/app/reviews/approved", key: "approved" },
    { href: "/app/reviews/trash", key: "trash" },
  ];

  return (
    <div className="orders-shell">
      <div className="wbp-card wbp-surface reviews-head">
        <div className="reviews-head__top">
          <div style={{ minWidth: 0 }}>
            <div className="reviews-title">Reviews</div>
            <div className="reviews-sub">
              Moderate reviews for <span className="reviews-chip">{shopDomain}</span>
              {q ? <span className="reviews-dim"> • searching “{q}”</span> : null}
            </div>
          </div>

          <div className="reviews-head__right">
            <div className="reviews-pill reviews-pill--top">
              <span className="reviews-pill__dot" data-accent={accentForStatus(initialStatus)} />
              {pillLabel(initialStatus)}
            </div>

            <button className="wbp-iconbtn" type="button" title="Refresh" aria-label="Refresh" onClick={() => router.refresh()}>
              ↻
            </button>
          </div>
        </div>

        <div className="orders-tabs reviews-tabs" style={{ marginTop: 12 }}>
          {tabs.map((t) => {
            const active = initialStatus === t.key;
            return (
              <Link
                key={t.key}
                href={t.href}
                className={["orders-tab", active ? "orders-tab--active" : ""].join(" ")}
                style={{ textDecoration: "none" }}
              >
                <div className="reviews-tabTop">
                  <div style={{ fontWeight: 950 }}>{pillLabel(t.key)}</div>
                  <span className={["reviews-count", active ? "reviews-count--active" : ""].join(" ")}>
                    {counts[t.key]}
                  </span>
                </div>

                <div className="reviews-tabSub">
                  {t.key === "pending"
                    ? "Approve or reject incoming reviews"
                    : t.key === "approved"
                    ? "Live on the storefront"
                    : "Restore or delete permanently"}
                </div>
              </Link>
            );
          })}
        </div>

        {notice && <div className="reviews-notice">{notice}</div>}
      </div>

      {visible.length === 0 ? (
        <div className="wbp-card wbp-surface reviews-emptyHint" style={{ padding: 18 }}>
          <div style={{ fontWeight: 950, fontSize: 16 }}>{q ? "No matching reviews" : "Nothing here yet"}</div>
          <div style={{ opacity: 0.7, marginTop: 6 }}>
            {q
              ? "Use the top search bar to try a different term."
              : initialStatus === "pending"
              ? "New reviews will appear here for moderation."
              : initialStatus === "approved"
              ? "Approved reviews will appear here."
              : "Rejected reviews appear here until permanently deleted."}
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={onDragStart}
          onDragCancel={onDragCancel}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={visible.map((r) => r.id)} strategy={rectSortingStrategy}>
            <div className="reviews-grid">
              {visible.map((r) => (
                <ReviewCard
                  key={r.id}
                  r={r}
                  lane={initialStatus}
                  shopDomain={shopDomain}
                  onOpen={(id) => setOpenId(id)}
                  onApprove={approve}
                  onReject={reject}
                  onToPending={toPending}
                  onRestoreLast={restoreLast}
                  onDelete={del}
                  busy={busyId === r.id}
                  recentlyDraggedRef={recentlyDraggedRef}
                />
              ))}
            </div>
          </SortableContext>

          {/* dock only while dragging (exactly 2 boxes) */}
          {draggingId ? (
            <div className="orders-dock">
              {dockTargets.map((t) => (
                <DockZone key={t.id} id={t.id} label={t.label} accent={t.accent} />
              ))}
            </div>
          ) : null}

          <DragOverlay>
            {overlayReview ? (
              <div className="orders-card orders-card--overlay wbp-card" data-accent={accentForStatus(initialStatus)}>
                <div className="reviews-card__top">
                  <div style={{ minWidth: 0 }}>
                    <div className="reviews-card__line">
                      <div className="reviews-name">{displayName(overlayReview)}</div>
                      <Stars rating={overlayReview.rating} />
                    </div>
                    <div className="reviews-meta">
                      <span className="reviews-link" style={{ fontWeight: 900 }}>
                        {productName(overlayReview)}
                      </span>
                      <span className="reviews-dim"> • #{overlayReview.productId}</span>
                    </div>
                  </div>
                  <span className="orders-card__state">{pillLabel(initialStatus)}</span>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <ReviewsDrawer
        open={!!activeReview}
        review={activeReview}
        status={initialStatus}
        shopDomain={shopDomain}
        busy={busyId}
        onCloseAction={() => setOpenId(null)}
        onApproveAction={() => {
          if (!activeReview) return;
          approve(activeReview.id);
        }}
        onToPendingAction={() => {
          if (!activeReview) return;
          toPending(activeReview.id);
        }}
        onRejectAction={() => {
          if (!activeReview) return;
          reject(activeReview.id);
        }}
        onRestoreAction={() => {
          if (!activeReview) return;
          void restoreLast(activeReview.id);
        }}
        onDeleteAction={() => {
          if (!activeReview) return;
          del(activeReview.id);
        }}
      />
    </div>
  );
}
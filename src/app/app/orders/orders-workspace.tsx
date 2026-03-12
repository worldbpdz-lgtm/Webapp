// src/app/app/orders/orders-workspace.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import OrdersDrawer from "./orders-drawer";
import { usePermissions } from "@/components/shell/permissions-context";

type LaneId = "review" | "confirmed" | "declined";
type CardStatus =
  | "received"
  | "in_review"
  | "contacted"
  | "confirmed"
  | "cancelled"
  | "spam"
  | "archived";

type Card = {
  id: string;
  status: CardStatus;
  name: string;
  roleType: string;
  productId: string | null;
  productTitle: string | null;
  qty: number | null;
  wilaya: string | null;
  createdAt: string;
};

type Props = {
  shopId: string;
  shopDomain: string;
  activeRoute: LaneId;
  cards: Card[];
  counts: Record<LaneId, number>;
};

function laneFromPath(pathname: string): LaneId {
  if (pathname.endsWith("/confirmed")) return "confirmed";
  if (pathname.endsWith("/declined")) return "declined";
  return "review";
}

function toLane(status: CardStatus): LaneId {
  if (status === "confirmed") return "confirmed";
  if (status === "cancelled") return "declined";
  return "review";
}

function laneLabel(lane: LaneId) {
  if (lane === "review") return "In Review";
  if (lane === "confirmed") return "Confirmed";
  return "Declined";
}

function laneAccent(lane: LaneId) {
  if (lane === "confirmed") return "ok";
  if (lane === "declined") return "bad";
  return "warn";
}

function formatDateNoSeconds(iso: string) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return iso;
  }
}

function productLabel(c: Card) {
  if (c.productTitle) return c.productTitle;
  if (!c.productId) return "—";
  const raw = String(c.productId).trim();
  const m = raw.match(/Product\/(\d+)/);
  if (m?.[1]) return `Product #${m[1]}`;
  if (/^\d+$/.test(raw)) return `Product #${raw}`;
  return `Product #${raw.slice(-8)}`;
}

type StatusMeta = {
  prevStatus?: CardStatus | null;
};

async function apiSetStatus(shopId: string, id: string, status: CardStatus, meta?: StatusMeta) {
  const res = await fetch(`/api/requests/${id}/status?shopId=${encodeURIComponent(shopId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status, ...(meta || {}) }),
  });
  if (!res.ok) throw new Error("Failed to update status");
}

function StatusTab({
  lane,
  active,
  count,
  onGo,
}: {
  lane: LaneId;
  active: boolean;
  count: number;
  onGo: (lane: LaneId) => void;
}) {
  return (
    <button
      type="button"
      className="orders-tab wbp-card"
      data-active={active ? "true" : "false"}
      data-accent={laneAccent(lane)}
      onClick={() => onGo(lane)}
    >
      <div className="orders-tab__top">
        <div className="orders-tab__title">{laneLabel(lane)}</div>
        <div className="orders-tab__count">{count}</div>
      </div>
      <div className="orders-tab__sub">Click to open</div>
    </button>
  );
}

function DockZone({ id, label, accent }: { id: string; label: string; accent: "ok" | "bad" | "warn" }) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: { type: "dock" },
  });

  return (
    <div
      ref={setNodeRef}
      className="orders-dock__zone"
      data-accent={accent}
      data-over={isOver ? "true" : "false"}
    >
      <div className="orders-dock__label">{label}</div>
    </div>
  );
}

function OrderCard({
  card,
  lane,
  onOpen,
  onConfirm,
  onDecline,
  onTrash,
  busy,
  recentlyDraggedRef,
  canConfirm,
  canDecline,
  canArchive,
}: {
  card: Card;
  lane: LaneId;
  onOpen: (id: string) => void;
  onConfirm: (id: string) => void;
  onDecline: (id: string) => void;
  onTrash: (id: string) => void;
  busy: boolean;
  recentlyDraggedRef: React.MutableRefObject<boolean>;
  canConfirm: boolean;
  canDecline: boolean;
  canArchive: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", card },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="orders-card wbp-card"
      data-accent={laneAccent(lane)}
      data-dragging={isDragging ? "true" : "false"}
      data-busy={busy ? "true" : "false"}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (recentlyDraggedRef.current) return;
        onOpen(card.id);
      }}
      role="button"
      tabIndex={0}
    >
      <div className="orders-card__head">
        <div className="orders-card__name">{card.name}</div>
        <div className="orders-pill orders-pill--ping" data-accent={laneAccent(lane)}>
          {laneLabel(lane)}
        </div>
      </div>

      <div className="orders-card__row">
        <span className="orders-chip">{card.roleType}</span>
        <span className="orders-dot">•</span>
        <span className="orders-trunc">{productLabel(card)}</span>
      </div>

      <div className="orders-card__row orders-card__row--bottom">
        <span className="orders-muted">{formatDateNoSeconds(card.createdAt)}</span>
        <span className="orders-dot">•</span>
        <span className="orders-muted">{card.wilaya ?? "—"}</span>
        <span className="orders-dot">•</span>
        <span className="orders-muted">Qty: {card.qty ?? "—"}</span>
      </div>

      {lane === "review" ? (
        <div className="orders-card__actions" onClick={(e) => e.stopPropagation()}>
          {canConfirm ? (
            <button
              className="orders-btn orders-btn--ok"
              disabled={busy}
              onClick={() => onConfirm(card.id)}
              type="button"
            >
              Confirm
            </button>
          ) : null}

          {canDecline ? (
            <button
              className="orders-btn orders-btn--bad"
              disabled={busy}
              onClick={() => onDecline(card.id)}
              type="button"
            >
              Decline
            </button>
          ) : null}
        </div>
      ) : lane === "confirmed" ? (
        <div className="orders-card__state orders-card__state--ok" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>✓ Order confirmed</div>

            {canArchive ? (
              <button
                className="orders-miniDanger"
                disabled={busy}
                onClick={() => onTrash(card.id)}
                type="button"
                title="Move to Trash"
              >
                Delete
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="orders-card__state orders-card__state--bad" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>✕ Order declined</div>

            {canArchive ? (
              <button
                className="orders-miniDanger"
                disabled={busy}
                onClick={() => onTrash(card.id)}
                type="button"
                title="Move to Trash"
              >
                Delete
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

// ✅ Only trigger dock if pointer is INSIDE it.
// Otherwise allow sorting among cards.
const collisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length) return pointerHits;

  const cardsOnly = args.droppableContainers.filter((c) => c.data?.current?.type === "card");
  return closestCenter({ ...args, droppableContainers: cardsOnly });
};

export default function OrdersWorkspace({ shopId, shopDomain, cards }: Props) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const sp = useSearchParams();
  const activeLane = laneFromPath(pathname);

  // ✅ permissions (read once here, pass booleans down)
  const perms = usePermissions();
  const canConfirm = !!perms?.orders?.confirm;
  const canDecline = !!perms?.orders?.decline;
  const canMoveToReview = !!perms?.orders?.moveToReview;
  const canArchive = !!perms?.orders?.archive;

  const [lanes, setLanes] = useState<Record<LaneId, Card[]>>({
    review: [],
    confirmed: [],
    declined: [],
  });

  const [openId, setOpenId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const overridesRef = useRef(new Map<string, CardStatus>());
  const recentlyDraggedRef = useRef(false);

  useEffect(() => {
    const next: Record<LaneId, Card[]> = { review: [], confirmed: [], declined: [] };
    for (const c of cards || []) {
      const forced = overridesRef.current.get(c.id);
      const status = forced ?? c.status;
      const fixed = forced ? ({ ...c, status } as Card) : c;

      // IMPORTANT: archived/spam should never render in lanes
      if (status === "archived" || status === "spam") continue;

      next[toLane(status)].push(fixed);
    }
    (Object.keys(next) as LaneId[]).forEach((k) => {
      next[k].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    });
    setLanes(next);
  }, [cards]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const counts = useMemo(
    () => ({
      review: lanes.review.length,
      confirmed: lanes.confirmed.length,
      declined: lanes.declined.length,
    }),
    [lanes]
  );

  const byId = useMemo(() => {
    const m = new Map<string, Card>();
    (Object.values(lanes).flat() as Card[]).forEach((c) => m.set(c.id, c));
    return m;
  }, [lanes]);

  const activeCards = lanes[activeLane] ?? [];
  const qText = (sp?.get("q") || "").trim().toLowerCase();

  const visibleCards = useMemo(() => {
    if (!qText) return activeCards;

    return activeCards.filter((c) => {
      const hay = [
        c.id,
        c.name,
        c.roleType,
        c.productTitle ?? "",
        c.productId ?? "",
        c.wilaya ?? "",
        String(c.qty ?? ""),
        c.createdAt,
        formatDateNoSeconds(c.createdAt),
      ]
        .join(" | ")
        .toLowerCase();

      return hay.includes(qText);
    });
  }, [activeCards, qText]);

  const overlayCard = draggingId ? byId.get(draggingId) ?? null : null;

  const range = (sp?.get("range") || "").trim();
  const RANGE_KEY = "wbp-orders-range";

  // restore range if missing from URL (ex: coming from sidebar)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const urlRange = (sp?.get("range") || "").trim();
    if (urlRange) {
      window.localStorage.setItem(RANGE_KEY, urlRange);
      return;
    }

    const saved = window.localStorage.getItem(RANGE_KEY);
    const next = (saved || "all").trim();

    const q = new URLSearchParams(sp?.toString() || "");
    q.set("range", next);
    router.replace(`${pathname}?${q.toString()}`);
    window.setTimeout(() => router.refresh(), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function setRange(next: string) {
    if (typeof window !== "undefined") window.localStorage.setItem("wbp-orders-range", next);
    const q = new URLSearchParams(sp?.toString() || "");
    q.set("range", next);
    router.push(`${pathname}?${q.toString()}`);
    window.setTimeout(() => router.refresh(), 150);
  }

  function go(lane: LaneId) {
    const q = new URLSearchParams(sp?.toString() || "");
    router.push(`/app/orders/${lane}?${q.toString()}`);
  }

  function markRecentlyDragged() {
    recentlyDraggedRef.current = true;
    window.setTimeout(() => (recentlyDraggedRef.current = false), 260);
  }

  function moveLocal(id: string, status: CardStatus) {
    overridesRef.current.set(id, status);

    setLanes((prev) => {
      const next: Record<LaneId, Card[]> = {
        review: [...prev.review],
        confirmed: [...prev.confirmed],
        declined: [...prev.declined],
      };

      let removed: Card | null = null;
      for (const lane of ["review", "confirmed", "declined"] as LaneId[]) {
        const idx = next[lane].findIndex((c) => c.id === id);
        if (idx !== -1) {
          removed = next[lane].splice(idx, 1)[0];
          break;
        }
      }
      if (!removed) return prev;

      // ✅ archived/spam should vanish immediately (no lane reinsert)
      if (status === "archived" || status === "spam") return next;

      const moved: Card = { ...removed, status };
      next[toLane(status)] = [moved, ...next[toLane(status)]];
      return next;
    });
  }

  async function setStatus(id: string, status: CardStatus, toUrl?: string, meta?: StatusMeta) {
    setBusyId(id);
    moveLocal(id, status);

    try {
      await apiSetStatus(shopId, id, status, meta);
    } catch {
      overridesRef.current.delete(id);
      router.refresh();
      setBusyId(null);
      return;
    }

    // ✅ Only navigate when explicitly asked (we will NOT navigate on Trash)
    if (toUrl) {
      const q = new URLSearchParams(sp?.toString() || "");
      router.push(`${toUrl}?${q.toString()}`);
    }

    window.setTimeout(() => router.refresh(), 250);

    setBusyId(null);
    setOpenId(null);
  }

  const confirm = (id: string) => {
    if (!canConfirm) return;
    return setStatus(id, "confirmed", "/app/orders/confirmed");
  };

  const decline = (id: string) => {
    if (!canDecline) return;
    return setStatus(id, "cancelled", "/app/orders/declined");
  };

  const backToReview = (id: string) => {
    if (!canMoveToReview) return;
    return setStatus(id, "in_review", "/app/orders/review");
  };

  // ✅ FIX 1: Delete should NOT navigate to Trash
  // ✅ FIX 2: store prevStatus so restore returns to the right lane
  const trash = (id: string) => {
    if (!canArchive) return;
    const prev = byId.get(id)?.status ?? null;
    return setStatus(id, "archived", undefined, { prevStatus: prev });
  };

  const dockTargets = useMemo(() => {
    const targets: Array<{ id: string; label: string; accent: "ok" | "bad" | "warn"; act: (id: string) => void }> = [];

    if (activeLane === "review") {
      if (canConfirm) targets.push({ id: "dock:ok", label: "Confirm", accent: "ok", act: confirm });
      if (canDecline) targets.push({ id: "dock:bad", label: "Decline", accent: "bad", act: decline });
      return targets;
    }

    if (activeLane === "confirmed") {
      if (canMoveToReview) targets.push({ id: "dock:warn", label: "In Review", accent: "warn", act: backToReview });
      if (canDecline) targets.push({ id: "dock:bad", label: "Decline", accent: "bad", act: decline });
      return targets;
    }

    // declined lane
    if (canConfirm) targets.push({ id: "dock:ok", label: "Confirm", accent: "ok", act: confirm });
    if (canMoveToReview) targets.push({ id: "dock:warn", label: "In Review", accent: "warn", act: backToReview });
    return targets;
  }, [activeLane, canConfirm, canDecline, canMoveToReview]);

  function onDragStart(e: DragStartEvent) {
    setDraggingId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    setDraggingId(null);
    markRecentlyDragged();

    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;

    // ✅ dock action
    if (overId.startsWith("dock:")) {
      const target = dockTargets.find((t) => t.id === overId);
      if (target) target.act(id);
      return;
    }

    // Optional: don’t reorder while searching (prevents weird reorder vs hidden cards)
    if (qText) return;

    // ✅ reorder within lane
    setLanes((prev) => {
      const items = prev[activeLane] ?? [];
      const oldIndex = items.findIndex((c) => c.id === id);
      const newIndex = items.findIndex((c) => c.id === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev;

      const moved = arrayMove(items, oldIndex, newIndex);
      return { ...prev, [activeLane]: moved };
    });
  }

  return (
    <div className="orders-shell">
      <div className="orders-rangeBar wbp-surface">
        <div className="orders-rangeTitle">Filter by time</div>
        <div className="orders-rangePills">
          {[
            ["today", "Today"],
            ["7d", "Past week"],
            ["30d", "Last month"],
            ["6m", "Last 6 months"],
            ["all", "All time"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              className="orders-rangePill"
              data-active={range === k ? "true" : "false"}
              onClick={() => setRange(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="orders-tabs wbp-surface">
        {(["review", "confirmed", "declined"] as LaneId[]).map((lane) => (
          <StatusTab key={lane} lane={lane} active={activeLane === lane} count={counts[lane]} onGo={go} />
        ))}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={visibleCards.map((c) => c.id)} strategy={rectSortingStrategy}>
          <div className="orders-grid">
            {/* ✅ FIX: render visibleCards (filtered) not activeCards */}
            {visibleCards.map((c) => (
              <OrderCard
                key={c.id}
                card={c}
                lane={toLane(c.status)}
                onOpen={(id) => setOpenId(id)}
                onConfirm={confirm}
                onDecline={decline}
                onTrash={trash}
                busy={busyId === c.id}
                recentlyDraggedRef={recentlyDraggedRef}
                canConfirm={canConfirm}
                canDecline={canDecline}
                canArchive={canArchive}
              />
            ))}

            {visibleCards.length === 0 ? (
              <div className="orders-empty wbp-surface  wbp-card">
                <div className="orders-empty__title">Nothing here</div>
                <div className="orders-empty__sub">Try another search or adjust the time filter.</div>
              </div>
            ) : null}
          </div>
        </SortableContext>

        {draggingId && dockTargets.length ? (
          <div className="orders-dock">
            {dockTargets.map((t) => (
              <DockZone key={t.id} id={t.id} label={t.label} accent={t.accent} />
            ))}
          </div>
        ) : null}

        <DragOverlay>
          {overlayCard ? (
            <div className="orders-card orders-card--overlay wbp-card" data-accent={laneAccent(toLane(overlayCard.status))}>
              <div className="orders-card__head">
                <div className="orders-card__name">{overlayCard.name}</div>
                <div className="orders-pill orders-pill--ping" data-accent={laneAccent(toLane(overlayCard.status))}>
                  {laneLabel(toLane(overlayCard.status))}
                </div>
              </div>
              <div className="orders-card__row">
                <span className="orders-chip">{overlayCard.roleType}</span>
                <span className="orders-dot">•</span>
                <span className="orders-trunc">{productLabel(overlayCard)}</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <OrdersDrawer
        open={!!openId}
        requestId={openId}
        shopId={shopId}
        shopDomain={shopDomain}
        onCloseAction={() => setOpenId(null)}
        onConfirmAction={openId && canConfirm ? () => confirm(openId) : undefined}
        onDeclineAction={openId && canDecline ? () => decline(openId) : undefined}
      />
    </div>
  );
}
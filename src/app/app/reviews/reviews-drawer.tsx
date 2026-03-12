"use client";

import { useEffect } from "react";

type Status = "pending" | "approved" | "trash";

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

function name(r: Review) {
  if (r.authorLastName && r.authorLastName.length > 0) return `${r.authorName} ${r.authorLastName}`;
  return r.authorName;
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

export default function ReviewsDrawer({
  open,
  review,
  status,
  shopDomain,
  busy,
  onCloseAction,
  onApproveAction,
  onToPendingAction,
  onRejectAction,
  onRestoreAction,
  onDeleteAction,
}: {
  open: boolean;
  review: Review | null;
  status: Status;
  shopDomain: string;
  busy: string | null;

  onCloseAction: () => void;
  onApproveAction: () => void;
  onToPendingAction: () => void;
  onRejectAction: () => void;
  onRestoreAction: () => void;
  onDeleteAction: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseAction();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCloseAction]);

  if (!open || !review) return null;

  const disabled = busy === review.id;
  const adminProductUrl = `https://${shopDomain}/admin/products/${review.productId}`;

  return (
    <>
      <div className="orders-backdrop" onClick={onCloseAction} />
      <aside className="orders-modal reviews-modal" role="dialog" aria-modal="true">
        <button className="orders-closeX" onClick={onCloseAction} aria-label="Close" title="Close" type="button">
          ✕
        </button>

        <div className="reviews-drawerHead">
          <div style={{ minWidth: 0 }}>
            <div className="reviews-drawerTitle">
              {name(review)} <span className="reviews-drawerDim">• {review.rating}★</span>
            </div>

            <div className="reviews-drawerSub">
              <a className="reviews-link" href={adminProductUrl} target="_blank" rel="noreferrer">
                {productName(review)}
              </a>
              <span className="reviews-dim"> • #{review.productId}</span>
              {review.productHandle ? <span className="reviews-dim"> • {review.productHandle}</span> : null}
              <span className="reviews-dot">•</span>
              <span className="reviews-dim">{new Date(review.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="reviews-drawerBody">
          {review.title ? <div className="reviews-titleLine" style={{ fontSize: 16 }}>{review.title}</div> : null}

          <div className="reviews-body" style={{ WebkitLineClamp: "unset" as any }}>
            {review.body}
          </div>

          {review.authorEmail ? (
            <div className="reviews-email">
              <span className="reviews-dim">Email:</span> {review.authorEmail}
            </div>
          ) : null}

          {review.mediaUrl ? (
            <div className="reviews-media reviews-media--big">
              <img src={review.mediaUrl} alt="Review media" loading="lazy" />
            </div>
          ) : null}

          <div className="reviews-actions reviews-actions--drawer">
            {status === "pending" && (
              <>
                <button className="orders-btn orders-btn--ok" disabled={disabled} onClick={onApproveAction} type="button">
                  Approve
                </button>
                <button className="orders-btn orders-btn--danger" disabled={disabled} onClick={onRejectAction} type="button">
                  Reject
                </button>
              </>
            )}

            {status === "approved" && (
              <>
                <button className="orders-btn orders-btn--ok" disabled={disabled} onClick={onToPendingAction} type="button">
                  Move to Pending
                </button>
                <button className="orders-btn orders-btn--danger" disabled={disabled} onClick={onRejectAction} type="button">
                  Reject
                </button>
              </>
            )}

            {status === "trash" && (
              <>
                <button className="orders-btn orders-btn--ok" disabled={disabled} onClick={onRestoreAction} type="button">
                  Restore
                </button>
                <button className="orders-btn orders-btn--danger" disabled={disabled} onClick={onDeleteAction} type="button">
                  Delete permanently
                </button>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
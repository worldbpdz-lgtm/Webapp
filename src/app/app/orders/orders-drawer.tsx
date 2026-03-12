// src/app/app/orders/orders-drawer.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  open: boolean;
  requestId: string | null;
  shopId: string;
  shopDomain: string;
  onCloseAction: () => void;
  onConfirmAction?: () => void | Promise<void>;
  onDeclineAction?: () => void | Promise<void>;
};

type Detail = {
  request: {
    id: string;
    status: string;
    roleType: string;
    createdAt: string;

    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;

    address: string | null;
    wilayaName: string | null;
    communeName: string | null;

    // raw
    items: Array<{ id: string; productId: string; variantId: string | null; qty: number }>;

    // enriched (API returns this now)
    products?: Array<{
      productId: string;
      variantId: string | null;
      qty: number;
      title: string | null;
      imageUrl: string | null;
      adminUrl: string | null;
      storefrontUrl: string | null;
    }>;

    shopDomain?: string | null;

    attachments: Array<{
      id: string;
      label: string | null;
      requirementKey: string | null;
      upload: {
        url: string | null;
        bucket: string;
        path: string;
        mimeType: string | null;
        sizeBytes: number | null;
      };
    }>;
  };

  // optional, exists in dev (we don't render it here)
  debug?: any;
};

function formatBytes(bytes: number | null) {
  if (!bytes || bytes <= 0) return null;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function ValueOrMissing({ v }: { v: string | null | undefined }) {
  return v ? <>{v}</> : <span className="orders-missing">Not provided by customer</span>;
}

function numericIdFromProductId(idOrGid: string | null): string | null {
  if (!idOrGid) return null;
  const raw = String(idOrGid).trim();
  const m = raw.match(/Product\/(\d+)/);
  if (m?.[1]) return m[1];
  if (/^\d+$/.test(raw)) return raw;
  return null;
}

function shortProductLabel(productId: string | null) {
  const n = numericIdFromProductId(productId);
  if (n) return `Product #${n}`;
  if (!productId) return "Product";
  const raw = String(productId);
  return raw.length > 10 ? `Product #${raw.slice(-8)}` : `Product #${raw}`;
}

function adminProductUrl(shopDomain: string, productId: string | null) {
  const numeric = numericIdFromProductId(productId);
  if (!shopDomain || !numeric) return null;
  const store = shopDomain.replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${store}/products/${numeric}`;
}

export default function OrdersDrawer({
  open,
  requestId,
  shopId,
  shopDomain,
  onCloseAction,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !requestId) return;

    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);
      setDetail(null);

      try {
        const res = await fetch(`/api/requests/${requestId}?shopId=${encodeURIComponent(shopId)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as Detail;
        if (alive) setDetail(json);
      } catch (e: any) {
        if (alive) setError(e?.message || "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, requestId, shopId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseAction();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCloseAction]);

  const r = detail?.request;

  const fullName = useMemo(() => {
    if (!r) return "Order";
    return `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "Customer";
  }, [r]);

  if (!open) return null;

  return (
    <div className="orders-modalWrap" role="dialog" aria-modal="true">
      <button className="orders-modalBackdrop" onClick={onCloseAction} aria-label="Close" />
      <div className="orders-modal orders-modal--enter">
        <div className="orders-modalHead">
          <div>
            <div className="orders-modalTitle">{fullName}</div>
            <div className="orders-modalSub">
              {requestId ? (
                <>
                  #{requestId.slice(0, 10)}… • {r ? new Date(r.createdAt).toLocaleString() : "Loading…"} • Role:{" "}
                  {r?.roleType ?? "—"}
                </>
              ) : null}
            </div>
          </div>

          {/* ✅ only close X */}
          <div className="orders-modalActions">
            <button className="orders-closeX" onClick={onCloseAction} type="button" aria-label="Close" title="Close">
              ✕
            </button>
          </div>
        </div>

        <div className="orders-modalBody">
          {error ? (
            <div className="orders-errorCard">
              <div style={{ fontWeight: 1000 }}>Could not load order</div>
              <div className="orders-muted" style={{ marginTop: 8 }}>
                {error}
              </div>
            </div>
          ) : loading || !r ? (
            <div className="orders-skelGrid">
              <div className="orders-skelCard">
                <div className="skel skel-h" />
                <div className="skel skel-p" />
                <div className="skel skel-p" />
                <div className="skel skel-p" />
              </div>
              <div className="orders-skelCard">
                <div className="skel skel-h" />
                <div className="skel skel-p" />
                <div className="skel skel-p" />
                <div className="skel skel-big" />
              </div>
            </div>
          ) : (
            <div className="orders-detailGrid">
              <section className="orders-detailCard">
                <div className="orders-secTitle">Customer</div>
                <div className="orders-kvGrid">
                  <div>
                    <div className="orders-k">Email</div>
                    <div className="orders-v"><ValueOrMissing v={r.email} /></div>
                  </div>
                  <div>
                    <div className="orders-k">Phone</div>
                    <div className="orders-v"><ValueOrMissing v={r.phone} /></div>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div className="orders-k">Address</div>
                    <div className="orders-v"><ValueOrMissing v={r.address} /></div>
                  </div>
                  <div>
                    <div className="orders-k">Wilaya</div>
                    <div className="orders-v"><ValueOrMissing v={r.wilayaName} /></div>
                  </div>
                  <div>
                    <div className="orders-k">Commune</div>
                    <div className="orders-v"><ValueOrMissing v={r.communeName} /></div>
                  </div>
                </div>
              </section>

              <section className="orders-detailCard">
                <div className="orders-secTitle">Products & quantities</div>

                <div className="orders-stack">
                  {r.products?.length ? (
                    r.products.map((p, idx) => {
                      const shop = (r.shopDomain || shopDomain || "").trim();
                      const href =
                        p.adminUrl ||
                        adminProductUrl(shop, p.productId) ||
                        p.storefrontUrl ||
                        "#";

                      return (
                        <div key={`${p.productId}-${idx}`} className="orders-itemRow" style={{ gap: 12 }}>
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt=""
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: 12,
                                objectFit: "cover",
                                border: "1px solid rgba(255,255,255,.10)",
                                flex: "0 0 auto",
                              }}
                            />
                          ) : null}

                          <div className="orders-trunc" style={{ minWidth: 0 }}>
                            <a
                              className="orders-link"
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontWeight: 950, textDecoration: "none" }}
                              title="Open product"
                            >
                              {p.title ?? shortProductLabel(p.productId)}
                            </a>

                            {p.variantId ? <span className="orders-muted"> • {p.variantId}</span> : null}
                          </div>

                          <div className="orders-qty">Qty {p.qty}</div>
                        </div>
                      );
                    })
                  ) : r.items.length ? (
                    r.items.map((it) => {
                      const href = adminProductUrl(shopDomain, it.productId);
                      return (
                        <div key={it.id} className="orders-itemRow">
                          <div className="orders-trunc">
                            {href ? (
                              <a
                                className="orders-link"
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontWeight: 900 }}
                                title="Open in Shopify Admin"
                              >
                                {shortProductLabel(it.productId)}
                              </a>
                            ) : (
                              shortProductLabel(it.productId)
                            )}
                            {it.variantId ? <span className="orders-muted"> • {it.variantId}</span> : null}
                          </div>
                          <div className="orders-qty">Qty {it.qty}</div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="orders-missing">Customer didn’t provide product items.</div>
                  )}
                </div>

                {r.attachments.length ? (
                  <>
                    <div className="orders-secTitle" style={{ marginTop: 14 }}>Attachments</div>
                    <div className="orders-stack">
                      {r.attachments.map((a) => {
                        const url = a.upload.url;
                        const mime = (a.upload.mimeType || "").toLowerCase();
                        const isImage = mime.startsWith("image/");
                        const isPdf = mime === "application/pdf";
                        const size = formatBytes(a.upload.sizeBytes);

                        return (
                          <div key={a.id} className="orders-attach">
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 900 }}>
                                  {a.label ?? a.requirementKey ?? "Attachment"}
                                </div>
                                <div className="orders-muted" style={{ marginTop: 4 }}>
                                  {a.upload.mimeType ?? "file"}{size ? ` • ${size}` : ""}
                                </div>
                              </div>
                              {url ? (
                                <a className="orders-link" href={url} target="_blank" rel="noreferrer">
                                  Open
                                </a>
                              ) : null}
                            </div>

                            {url && isImage ? <img className="orders-img" src={url} alt="" /> : null}
                            {url && isPdf ? <iframe className="orders-pdf" title="PDF preview" src={url} /> : null}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="orders-missing" style={{ marginTop: 12 }}>
                    Customer didn’t provide attachments.
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
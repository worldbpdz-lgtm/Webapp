// src/app/app/analytics/analytics-workspace.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type SeriesRow = {
  bucket: string; // YYYY-MM-DD
  label: string; // friendly label
  total: number;
  confirmed: number;
  declined: number;
};

type BreakdownRow = {
  key: string;
  total: number;
  confirmed: number;
  declined: number;
};

type Payload = {
  meta: {
    range: string;
    bucketUnit: "day" | "week";
    start: string; // ISO
    end: string; // ISO (exclusive)
    timezone: string;
  };
  totals: {
    total: number;
    confirmed: number;
    declined: number;
    confirmRate: number; // 0..1
    avgPerBucket: number;
    avgDecisionHours: number | null;
  };
  prevTotals: {
    total: number;
    confirmed: number;
    declined: number;
    confirmRate: number;
  } | null;
  series: SeriesRow[];
  byRole: BreakdownRow[];
  byWilaya: BreakdownRow[];
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function fmtInt(n: number) {
  try {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
  } catch {
    return String(n);
  }
}

function fmtMoney(n: number) {
  try {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(n));
  } catch {
    return String(Math.round(n));
  }
}

function fmtPct(v: number) {
  const p = Math.round(v * 1000) / 10;
  return `${p.toFixed(1)}%`;
}

function trendLabel(cur: number, prev: number) {
  if (!isFinite(prev) || prev <= 0) return { text: "—", dir: "flat" as const };
  const d = (cur - prev) / prev;
  const pct = Math.round(d * 1000) / 10;
  if (Math.abs(pct) < 0.1) return { text: "0.0%", dir: "flat" as const };
  return { text: `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`, dir: pct > 0 ? "up" : "down" as const };
}

function daysBetween(aIso: string, bIso: string) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  const d = (b - a) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.round(d));
}

function toYmd(d: Date) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function startEndLastMonths(months: number) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setMonth(start.getMonth() - months);

  // API end is often treated as exclusive — safest is “tomorrow”
  const endExclusive = new Date(end);
  endExclusive.setDate(endExclusive.getDate() + 1);

  return { start: toYmd(start), end: toYmd(endExclusive) };
}

function Kpi({
  title,
  value,
  sub,
  accent,
}: {
  title: string;
  value: string;
  sub?: React.ReactNode;
  accent: "warn" | "ok" | "bad";
}) {
  return (
    <div className="ana-kpi wbp-card" data-accent={accent}>
      <div className="ana-kpi__t">{title}</div>
      <div className="ana-kpi__v">{value}</div>
      {sub ? <div className="ana-kpi__s">{sub}</div> : null}
    </div>
  );
}

function LegendToggle({
  label,
  active,
  onClick,
  kind,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  kind: "total" | "ok" | "bad";
}) {
  return (
    <button
      type="button"
      className="ana-legend"
      data-active={active ? "true" : "false"}
      data-kind={kind}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="ana-legend__dot" />
      {label}
    </button>
  );
}

function SvgLineChart({
  data,
  showTotal,
  showConfirmed,
  showDeclined,
}: {
  data: SeriesRow[];
  showTotal: boolean;
  showConfirmed: boolean;
  showDeclined: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const height = 260;
  const padX = 18;
  const padY = 18;

  const maxY = useMemo(() => {
    let m = 0;
    for (const r of data) {
      if (showTotal) m = Math.max(m, r.total);
      if (showConfirmed) m = Math.max(m, r.confirmed);
      if (showDeclined) m = Math.max(m, r.declined);
    }
    return Math.max(4, m);
  }, [data, showTotal, showConfirmed, showDeclined]);

  const points = useMemo(() => {
    const n = Math.max(1, data.length);
    const W = 1000;
    const H = height;

    const x = (i: number) => padX + (i * (W - padX * 2)) / (n - 1 || 1);
    const y = (v: number) => padY + (1 - v / maxY) * (H - padY * 2);

    const mk = (getter: (r: SeriesRow) => number) =>
      data.map((r, i) => ({ x: x(i), y: y(getter(r)), v: getter(r) }));

    return {
      W,
      H,
      total: mk((r) => r.total),
      confirmed: mk((r) => r.confirmed),
      declined: mk((r) => r.declined),
      y,
    };
  }, [data, maxY]);

  function pathOf(arr: Array<{ x: number; y: number }>) {
    if (!arr.length) return "";
    let d = `M ${arr[0].x} ${arr[0].y}`;
    for (let i = 1; i < arr.length; i++) d += ` L ${arr[i].x} ${arr[i].y}`;
    return d;
  }

  const pTotal = showTotal ? pathOf(points.total) : "";
  const pOk = showConfirmed ? pathOf(points.confirmed) : "";
  const pBad = showDeclined ? pathOf(points.declined) : "";

  const hover = hoverIdx != null ? data[hoverIdx] : null;

  return (
    <div
      ref={wrapRef}
      className="ana-chart"
      onMouseLeave={() => setHoverIdx(null)}
      onMouseMove={(e) => {
        if (!wrapRef.current) return;
        const rect = wrapRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const t = clamp(x / rect.width, 0, 1);
        const idx = Math.round(t * (data.length - 1));
        setHoverIdx(clamp(idx, 0, data.length - 1));
      }}
    >
      <svg viewBox={`0 0 ${points.W} ${points.H}`} width="100%" height={height} role="img" aria-label="Orders over time">
        <defs>
          <filter id="anaGlow">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {Array.from({ length: 5 }).map((_, i) => {
          const y = padY + (i * (points.H - padY * 2)) / 4;
          return (
            <line
              key={i}
              x1={padX}
              x2={points.W - padX}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity="0.08"
              strokeWidth="1"
            />
          );
        })}

        {showTotal ? <path className="ana-line ana-line--total" d={pTotal} filter="url(#anaGlow)" /> : null}
        {showConfirmed ? <path className="ana-line ana-line--ok" d={pOk} filter="url(#anaGlow)" /> : null}
        {showDeclined ? <path className="ana-line ana-line--bad" d={pBad} filter="url(#anaGlow)" /> : null}

        {hoverIdx != null ? (
          <>
            <line
              x1={points.total[hoverIdx]?.x ?? 0}
              x2={points.total[hoverIdx]?.x ?? 0}
              y1={padY}
              y2={points.H - padY}
              stroke="currentColor"
              strokeOpacity="0.14"
              strokeWidth="1"
            />
            {showTotal ? (
              <circle className="ana-dot ana-dot--total" cx={points.total[hoverIdx].x} cy={points.total[hoverIdx].y} r="5" />
            ) : null}
            {showConfirmed ? (
              <circle className="ana-dot ana-dot--ok" cx={points.confirmed[hoverIdx].x} cy={points.confirmed[hoverIdx].y} r="5" />
            ) : null}
            {showDeclined ? (
              <circle className="ana-dot ana-dot--bad" cx={points.declined[hoverIdx].x} cy={points.declined[hoverIdx].y} r="5" />
            ) : null}
          </>
        ) : null}
      </svg>

      {hover ? (
        <div className="ana-tip">
          <div className="ana-tip__t">{hover.label}</div>
          <div className="ana-tip__row">
            <span className="ana-badge ana-badge--total">Total</span> {fmtInt(hover.total)}
          </div>
          <div className="ana-tip__row">
            <span className="ana-badge ana-badge--ok">Confirmed</span> {fmtInt(hover.confirmed)}
          </div>
          <div className="ana-tip__row">
            <span className="ana-badge ana-badge--bad">Declined</span> {fmtInt(hover.declined)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
  topN,
}: {
  title: string;
  rows: BreakdownRow[];
  topN: number;
}) {
  const sliced = (rows || []).slice(0, topN);
  return (
    <div className="ana-card wbp-card">
      <div className="ana-card__title">{title}</div>

      {sliced.length === 0 ? (
        <div className="ana-muted" style={{ marginTop: 10 }}>
          No data.
        </div>
      ) : (
        <div className="ana-break">
          {sliced.map((r) => {
            const rate = r.total ? r.confirmed / r.total : 0;
            return (
              <div key={r.key} className="ana-breakRow">
                <div className="ana-breakLeft">
                  <div className="ana-breakKey">{r.key}</div>
                  <div className="ana-breakSub ana-muted">
                    {fmtInt(r.confirmed)} confirmed • {fmtInt(r.declined)} declined
                  </div>
                </div>

                <div className="ana-breakRight">
                  <span className="ana-chip ana-chip--total">Total {fmtInt(r.total)}</span>
                  <span className="ana-chip ana-chip--ok">Confirmed {fmtInt(r.confirmed)}</span>
                  <span className="ana-chip ana-chip--rate">{fmtPct(rate)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AnalyticsWorkspace({
  shopId,
  shopDomain,
  timezone,
  currency,
  initialRange,
  initialStart,
  initialEnd,
}: {
  shopId: string;
  shopDomain: string;
  timezone: string;
  currency: string;
  initialRange: string;
  initialStart: string;
  initialEnd: string;
}) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const sp = useSearchParams();

  const RANGE_KEY = "wbp-analytics-range";
  const [range, setRangeState] = useState(initialRange || "30d");
  const [start, setStart] = useState(initialStart || "");
  const [end, setEnd] = useState(initialEnd || "");

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showTotal, setShowTotal] = useState(true);
  const [showConfirmed, setShowConfirmed] = useState(true);
  const [showDeclined, setShowDeclined] = useState(true);

  // Normal profit simulator (local only): income - cost
  const [income, setIncome] = useState<number>(0);
  const [cost, setCost] = useState<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(RANGE_KEY);
    if (!sp?.get("range") && saved) {
      const q = new URLSearchParams(sp?.toString() || "");
      q.set("range", saved);
      router.replace(`${pathname}?${q.toString()}`);
      window.setTimeout(() => router.refresh(), 80);
    }

    const inc = Number(window.localStorage.getItem("ana-income") || "0");
    const cst = Number(window.localStorage.getItem("ana-costTotal") || "0");
    setIncome(isFinite(inc) ? inc : 0);
    setCost(isFinite(cst) ? cst : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushParams(next: { range?: string; start?: string; end?: string }) {
    const q = new URLSearchParams(sp?.toString() || "");
    if (next.range != null) q.set("range", next.range);
    if (next.start != null) (next.start ? q.set("start", next.start) : q.delete("start"));
    if (next.end != null) (next.end ? q.set("end", next.end) : q.delete("end"));
    router.push(`${pathname}?${q.toString()}`);
  }

  function setRange(next: string) {
    setRangeState(next);
    if (typeof window !== "undefined") window.localStorage.setItem(RANGE_KEY, next);
    if (next !== "custom") {
      setStart("");
      setEnd("");
      pushParams({ range: next, start: "", end: "" });
    } else {
      pushParams({ range: next });
    }
  }

  useEffect(() => {
    const urlRange = (sp?.get("range") || "").trim() || initialRange || "30d";
    const urlStart = (sp?.get("start") || "").trim();
    const urlEnd = (sp?.get("end") || "").trim();
    setRangeState(urlRange);
    setStart(urlStart);
    setEnd(urlEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp?.toString()]);

  // ✅ 6m preset dates (client-side) so it always works
  const sixMonths = useMemo(() => startEndLastMonths(6), []);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);

      try {
        const q = new URLSearchParams();
        q.set("shopId", shopId);

        // ✅ If backend doesn't support range=6m, we send it as custom start/end.
        if (range === "6m") {
          q.set("range", "custom");
          q.set("start", sixMonths.start);
          q.set("end", sixMonths.end);
        } else {
          q.set("range", range);
          if (range === "custom") {
            if (start) q.set("start", start);
            if (end) q.set("end", end);
          }
        }

        const res = await fetch(`/api/analytics/overview?${q.toString()}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as Payload;
        setData(json);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError(e?.message || "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    })();

    return () => ctrl.abort();
  }, [shopId, range, start, end, sixMonths.start, sixMonths.end]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ana-income", String(income || 0));
    window.localStorage.setItem("ana-costTotal", String(cost || 0));
  }, [income, cost]);

  const totals = data?.totals;
  const prev = data?.prevTotals;

  const tTotal = totals?.total || 0;
  const tOk = totals?.confirmed || 0;
  const tBad = totals?.declined || 0;
  const confirmRate = totals?.confirmRate || 0;

  const trTotal = prev ? trendLabel(tTotal, prev.total) : { text: "—", dir: "flat" as const };
  const trRate = prev ? trendLabel(confirmRate, prev.confirmRate) : { text: "—", dir: "flat" as const };

  const bucketDays = data?.meta ? daysBetween(data.meta.start, data.meta.end) : 0;

  const estProfit = useMemo(() => (income || 0) - (cost || 0), [income, cost]);
  const profitMargin = useMemo(() => {
    const inc = income || 0;
    if (inc <= 0) return 0;
    return estProfit / inc;
  }, [estProfit, income]);

  return (
    <div className="ana-shell">
      <div className="ana-head wbp-surface">
        <div>
          <div className="ana-title">Analytics</div>
          <div className="ana-sub">
            {shopDomain} • TZ: {timezone}
          </div>
        </div>

        <div className="ana-range">
          {[
            ["today", "Today"],
            ["7d", "7D"],
            ["30d", "30D"],
            ["6m", "6M"],
            ["all", "All"],
            ["custom", "Custom"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              className="ana-pill"
              data-active={range === k ? "true" : "false"}
              onClick={() => setRange(k)}
            >
              {label}
            </button>
          ))}
        </div>

        {range === "custom" ? (
          <div className="ana-custom">
            <div className="ana-custom__field">
              <div className="ana-custom__lab">Start</div>
              <input
                className="ana-input"
                type="date"
                value={start}
                onChange={(e) => {
                  const v = e.target.value;
                  setStart(v);
                  pushParams({ start: v });
                }}
              />
            </div>
            <div className="ana-custom__field">
              <div className="ana-custom__lab">End</div>
              <input
                className="ana-input"
                type="date"
                value={end}
                onChange={(e) => {
                  const v = e.target.value;
                  setEnd(v);
                  pushParams({ end: v });
                }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="ana-kpis wbp-surface">
        <Kpi
          title="Total requests"
          value={loading ? "—" : fmtInt(tTotal)}
          accent="warn"
          sub={
            <span className="ana-trend" data-dir={trTotal.dir}>
              vs prev: {trTotal.text}
            </span>
          }
        />
        <Kpi title="Confirmed" value={loading ? "—" : fmtInt(tOk)} accent="ok" />
        <Kpi title="Declined" value={loading ? "—" : fmtInt(tBad)} accent="bad" />
        <Kpi
          title="Confirm rate"
          value={loading ? "—" : fmtPct(confirmRate)}
          accent={confirmRate >= 0.35 ? "ok" : confirmRate >= 0.18 ? "warn" : "bad"}
          sub={
            <span className="ana-trend" data-dir={trRate.dir}>
              vs prev: {trRate.text}
            </span>
          }
        />
        <Kpi
          title={`Avg / ${data?.meta.bucketUnit ?? "day"}`}
          value={loading ? "—" : fmtInt(Math.round((totals?.avgPerBucket || 0) * 10) / 10)}
          accent="warn"
          sub={
            totals?.avgDecisionHours != null ? (
              <span className="ana-muted">Avg decision: ~{Math.round(totals.avgDecisionHours)}h</span>
            ) : (
              <span className="ana-muted">Decision time: —</span>
            )
          }
        />
      </div>

      <div className="ana-grid">
        <div className="ana-card wbp-card">
          <div className="ana-card__top">
            <div>
              <div className="ana-card__title">Requests over time</div>
              <div className="ana-muted">
                Interactive • {data?.meta.bucketUnit === "week" ? "Weekly buckets" : "Daily buckets"}
              </div>
            </div>

            <div className="ana-legends">
              <LegendToggle kind="total" label="Total" active={showTotal} onClick={() => setShowTotal((v) => !v)} />
              <LegendToggle kind="ok" label="Confirmed" active={showConfirmed} onClick={() => setShowConfirmed((v) => !v)} />
              <LegendToggle kind="bad" label="Declined" active={showDeclined} onClick={() => setShowDeclined((v) => !v)} />
            </div>
          </div>

          {error ? (
            <div className="ana-error">
              <div style={{ fontWeight: 950 }}>Could not load analytics</div>
              <div className="ana-muted" style={{ marginTop: 6 }}>
                {error}
              </div>
            </div>
          ) : loading || !data ? (
            <div className="ana-skel" />
          ) : (
            <SvgLineChart
              data={data.series}
              showTotal={showTotal}
              showConfirmed={showConfirmed}
              showDeclined={showDeclined}
            />
          )}
        </div>

        {/* ✅ Normal profit simulator */}
        <div className="ana-card wbp-card">
          <div className="ana-card__title">Profit simulator</div>
          <div className="ana-muted" style={{ marginTop: 6 }}>
            Enter totals for this period. Stored locally in your browser.
          </div>

          <div className="ana-form">
            <label className="ana-field">
              <span>Total income ({currency})</span>
              <input
                className="ana-input"
                inputMode="numeric"
                value={String(income)}
                onChange={(e) => setIncome(Number(e.target.value || 0))}
              />
            </label>

            <label className="ana-field">
              <span>Total cost ({currency})</span>
              <input
                className="ana-input"
                inputMode="numeric"
                value={String(cost)}
                onChange={(e) => setCost(Number(e.target.value || 0))}
              />
            </label>
          </div>

          <div className="ana-profit" data-good={estProfit >= 0 ? "true" : "false"}>
            <div className="ana-profit__k">Profit</div>
            <div className="ana-profit__v">
              {loading ? "—" : `${fmtMoney(estProfit)} ${currency}`}
            </div>
            <div className="ana-profit__s">
              {income > 0 ? `Margin: ${fmtPct(profitMargin)}` : "Tip: set income > 0 to show margin."}
              {bucketDays ? ` • Period: ${bucketDays} days` : ""}
            </div>
          </div>

          <div className="ana-muted" style={{ marginTop: 10 }}>
            Formula: income − cost
          </div>
        </div>

        {/* ✅ Better breakdown cards */}
        <BreakdownCard title="By role" rows={data?.byRole || []} topN={6} />
        <BreakdownCard title="Top wilayas" rows={data?.byWilaya || []} topN={8} />
      </div>
    </div>
  );
}
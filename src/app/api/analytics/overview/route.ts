// src/app/api/analytics/overview/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isoDay(d: Date) {
  // YYYY-MM-DD (UTC)
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDaysUTC(d: Date, days: number) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function addWeeksUTC(d: Date, w: number) {
  return addDaysUTC(d, w * 7);
}

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseRange(range: string) {
  const now = new Date();
  const end = startOfUtcDay(addDaysUTC(now, 1)); // exclusive
  const r = (range || "30d").trim();

  if (r === "today") return { start: startOfUtcDay(now), end };
  if (r === "7d") return { start: startOfUtcDay(addDaysUTC(now, -6)), end };
  if (r === "30d") return { start: startOfUtcDay(addDaysUTC(now, -29)), end };
  if (r === "6m") return { start: startOfUtcDay(addDaysUTC(now, -183)), end };

  return { start: new Date(Date.UTC(2000, 0, 1)), end }; // "all" fallback; we’ll clamp below
}

function pickBucketUnit(days: number) {
  return days > 120 ? ("week" as const) : ("day" as const);
}

function toNumber(n: any) {
  if (typeof n === "bigint") return Number(n);
  if (typeof n === "number") return n;
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId");
  if (!shopId) return NextResponse.json({ error: "Missing shopId" }, { status: 400 });

  const range = (url.searchParams.get("range") || "30d").trim();
  const startQ = (url.searchParams.get("start") || "").trim();
  const endQ = (url.searchParams.get("end") || "").trim();

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { timezone: true },
  });

  const tz = (shop?.timezone || "UTC").trim() || "UTC";

  let start: Date;
  let end: Date;

  if (range === "custom") {
    if (!startQ || !endQ) {
      return NextResponse.json({ error: "Custom range requires start & end (YYYY-MM-DD)" }, { status: 400 });
    }
    // inclusive start, inclusive end -> exclusive end+1
    start = startOfUtcDay(new Date(`${startQ}T00:00:00Z`));
    end = startOfUtcDay(addDaysUTC(new Date(`${endQ}T00:00:00Z`), 1));
  } else if (range === "all") {
    // clamp "all" to your actual min date so it doesn't scan from year 2000 unnecessarily
    const minRow = await prisma.request.aggregate({
      where: { shopId },
      _min: { createdAt: true },
    });
    const min = minRow._min.createdAt ? startOfUtcDay(new Date(minRow._min.createdAt)) : startOfUtcDay(new Date());
    const parsed = parseRange("all");
    start = min;
    end = parsed.end;
  } else {
    const parsed = parseRange(range);
    start = parsed.start;
    end = parsed.end;
  }

  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const bucketUnit = pickBucketUnit(days);

  // prev period of same length
  const prevEnd = start;
  const prevStart = addDaysUTC(start, -days);

  // --- series query ---
  const rows = await prisma.$queryRaw<
    Array<{
      bucket: Date;
      total: bigint;
      confirmed: bigint;
      declined: bigint;
      decision_hours: number | null;
    }>
  >`
    SELECT
      (date_trunc(${bucketUnit}, "createdAt" AT TIME ZONE ${tz}))::date AS bucket,
      COUNT(*) FILTER (WHERE "status" <> 'spam') AS total,
      COUNT(*) FILTER (WHERE "status" = 'confirmed') AS confirmed,
      COUNT(*) FILTER (WHERE "status" = 'cancelled') AS declined,
      AVG(
        CASE
          WHEN "status" IN ('confirmed','cancelled')
          THEN EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) / 3600.0
          ELSE NULL
        END
      ) AS decision_hours
    FROM "Request"
    WHERE "shopId" = ${shopId}
      AND "createdAt" >= ${start}
      AND "createdAt" < ${end}
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  // Fill missing buckets (so chart doesn't look broken)
  const map = new Map<string, { total: number; confirmed: number; declined: number }>();
  let avgDecisionHours: number | null = null;
  // decision_hours in rows is an avg per bucket; we’ll compute a global avg below via a separate query
  for (const r of rows) {
    const k = isoDay(new Date(r.bucket));
    map.set(k, {
      total: toNumber(r.total),
      confirmed: toNumber(r.confirmed),
      declined: toNumber(r.declined),
    });
  }

  const step = bucketUnit === "week" ? 7 : 1;
  const series: Array<{ bucket: string; label: string; total: number; confirmed: number; declined: number }> = [];

  for (let d = new Date(start); d < end; d = addDaysUTC(d, step)) {
    const k = isoDay(d);
    const v = map.get(k) || { total: 0, confirmed: 0, declined: 0 };

    const label =
      bucketUnit === "week"
        ? `Week of ${k}`
        : new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short" }).format(d);

    series.push({ bucket: k, label, ...v });
  }

  const totals = series.reduce(
    (acc, r) => {
      acc.total += r.total;
      acc.confirmed += r.confirmed;
      acc.declined += r.declined;
      return acc;
    },
    { total: 0, confirmed: 0, declined: 0 }
  );

  const confirmRate = totals.total ? totals.confirmed / totals.total : 0;
  const avgPerBucket = series.length ? totals.total / series.length : 0;

  // Global avg decision time for confirmed/cancelled inside window
  const decision = await prisma.$queryRaw<Array<{ h: number | null }>>`
    SELECT
      AVG(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) / 3600.0) AS h
    FROM "Request"
    WHERE "shopId" = ${shopId}
      AND "createdAt" >= ${start}
      AND "createdAt" < ${end}
      AND "status" IN ('confirmed','cancelled')
  `;
  avgDecisionHours = decision?.[0]?.h ?? null;

  // prev totals (only if window isn't massive)
  let prevTotals: any = null;
  try {
    const prevRows = await prisma.$queryRaw<
      Array<{ total: bigint; confirmed: bigint; declined: bigint }>
    >`
      SELECT
        COUNT(*) FILTER (WHERE "status" <> 'spam') AS total,
        COUNT(*) FILTER (WHERE "status" = 'confirmed') AS confirmed,
        COUNT(*) FILTER (WHERE "status" = 'cancelled') AS declined
      FROM "Request"
      WHERE "shopId" = ${shopId}
        AND "createdAt" >= ${prevStart}
        AND "createdAt" < ${prevEnd}
    `;

    const p = prevRows?.[0];
    const pTotal = toNumber(p?.total ?? 0);
    const pOk = toNumber(p?.confirmed ?? 0);
    const pBad = toNumber(p?.declined ?? 0);
    prevTotals = {
      total: pTotal,
      confirmed: pOk,
      declined: pBad,
      confirmRate: pTotal ? pOk / pTotal : 0,
    };
  } catch {
    prevTotals = null;
  }

  // breakdown by role
  const byRoleRows = await prisma.$queryRaw<
    Array<{ key: string; total: bigint; confirmed: bigint; declined: bigint }>
  >`
    SELECT
      COALESCE("roleType"::text, 'unknown') AS key,
      COUNT(*) FILTER (WHERE "status" <> 'spam') AS total,
      COUNT(*) FILTER (WHERE "status" = 'confirmed') AS confirmed,
      COUNT(*) FILTER (WHERE "status" = 'cancelled') AS declined
    FROM "Request"
    WHERE "shopId" = ${shopId}
      AND "createdAt" >= ${start}
      AND "createdAt" < ${end}
    GROUP BY 1
    ORDER BY total DESC
  `;

  const byRole = byRoleRows.map((r) => ({
    key: r.key,
    total: toNumber(r.total),
    confirmed: toNumber(r.confirmed),
    declined: toNumber(r.declined),
  }));

  // breakdown by wilaya (French name if available)
  const byWilayaRows = await prisma.$queryRaw<
    Array<{ key: string; total: bigint; confirmed: bigint; declined: bigint }>
  >`
    SELECT
      COALESCE(w."nameFr", '—') AS key,
      COUNT(*) FILTER (WHERE req."status" <> 'spam') AS total,
      COUNT(*) FILTER (WHERE req."status" = 'confirmed') AS confirmed,
      COUNT(*) FILTER (WHERE req."status" = 'cancelled') AS declined
    FROM "Request" req
    LEFT JOIN "GeoWilaya" w
      ON w."code" = req."wilayaCode"
    WHERE req."shopId" = ${shopId}
      AND req."createdAt" >= ${start}
      AND req."createdAt" < ${end}
    GROUP BY 1
    ORDER BY total DESC
    LIMIT 12
  `;

  const byWilaya = byWilayaRows.map((r) => ({
    key: r.key,
    total: toNumber(r.total),
    confirmed: toNumber(r.confirmed),
    declined: toNumber(r.declined),
  }));

  return NextResponse.json({
    meta: {
      range,
      bucketUnit,
      start: start.toISOString(),
      end: end.toISOString(),
      timezone: tz,
    },
    totals: {
      ...totals,
      confirmRate,
      avgPerBucket,
      avgDecisionHours: avgDecisionHours != null && Number.isFinite(avgDecisionHours) ? avgDecisionHours : null,
    },
    prevTotals,
    series,
    byRole,
    byWilaya,
  });
}
// src/app/api/requests/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeShopDomain(v: string | null) {
  if (!v) return null;
  return String(v).trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function asShopifyGid(kind: "Product" | "ProductVariant", idOrGid: string | null) {
  if (!idOrGid) return null;
  const raw = String(idOrGid).trim();
  if (!raw) return null;
  if (raw.startsWith("gid://shopify/")) return raw;
  if (/^\d+$/.test(raw)) return `gid://shopify/${kind}/${raw}`;
  return null;
}

function numericIdFromProductId(idOrGid: string | null): string | null {
  if (!idOrGid) return null;
  const raw = String(idOrGid).trim();
  const m = raw.match(/Product\/(\d+)/);
  if (m?.[1]) return m[1];
  if (/^\d+$/.test(raw)) return raw;
  return null;
}

function storeHandleFromDomain(shopDomain: string) {
  return shopDomain.replace(".myshopify.com", "");
}

async function shopifyGraphqlWithFallback(
  shopDomain: string,
  accessToken: string,
  query: string,
  variables: any
) {
  // Try several versions so you don’t get stuck if a version is not supported.
  const versions = [
    "2026-01",
    "2025-10",
    "2025-07",
    "2025-04",
    "2025-01",
    "2024-10",
    "2024-07",
  ];

  let lastErr: any = null;

  for (const v of versions) {
    try {
      const res = await fetch(`https://${shopDomain}/admin/api/${v}/graphql.json`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-shopify-access-token": accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || json?.errors) {
        const msg =
          json?.errors?.[0]?.message ||
          json?.error ||
          `Shopify GraphQL failed (${res.status})`;
        throw new Error(`[${v}] ${msg}`);
      }

      return { json, apiVersion: v };
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr ?? new Error("Shopify GraphQL failed");
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId");
  const { id } = await ctx.params;

  const r = await prisma.request.findFirst({
    where: shopId ? { id, shopId } : { id },
    include: {
      Shop: { select: { shopDomain: true } },
      GeoWilaya: { select: { nameFr: true, nameAr: true } },
      GeoCommune: { select: { nameFr: true, nameAr: true } },
      RequestItem: { select: { id: true, productId: true, variantId: true, qty: true } },
      RequestAttachment: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          label: true,
          requirementKey: true,
          Upload: { select: { bucket: true, path: true, mimeType: true, sizeBytes: true, url: true } },
        },
      },
    },
  });

  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wilayaName = r.GeoWilaya?.nameFr ?? r.GeoWilaya?.nameAr ?? null;
  const communeName = r.GeoCommune?.nameFr ?? r.GeoCommune?.nameAr ?? null;

  const attachments = await Promise.all(
    r.RequestAttachment.map(async (a) => {
      let signedUrl: string | null = null;

      try {
        const { data, error } = await supabaseAdmin.storage
          .from(a.Upload.bucket)
          .createSignedUrl(a.Upload.path, 60 * 60);
        if (!error) signedUrl = data?.signedUrl ?? null;
      } catch {
        signedUrl = a.Upload.url ?? null;
      }

      return {
        id: a.id,
        label: a.label,
        requirementKey: a.requirementKey,
        upload: {
          url: signedUrl ?? a.Upload.url ?? null,
          bucket: a.Upload.bucket,
          path: a.Upload.path,
          mimeType: a.Upload.mimeType,
          sizeBytes: a.Upload.sizeBytes,
        },
      };
    })
  );

  // ---------- Product enrichment (Leadform parity) ----------
  const shopDomain = normalizeShopDomain(r.Shop?.shopDomain ?? null);

  // items fallback (in case some requests only have top-level productId/qty)
  const items =
    r.RequestItem.length > 0
      ? r.RequestItem
      : r.productId
        ? [{ id: "single", productId: r.productId, variantId: r.variantId ?? null, qty: r.qty ?? 1 }]
        : [];

  let products: Array<{
    productId: string;
    variantId: string | null;
    qty: number;
    title: string | null;
    imageUrl: string | null;
    adminUrl: string | null;
    storefrontUrl: string | null;
  }> = [];

  // Debug (safe: no secrets)
  let debug: any = {
    shopDomain,
    hasToken: false,
    sessionId: null as string | null,
    sessionShop: null as string | null,
    sessionIsOnline: null as boolean | null,
    apiVersion: null as string | null,
    shopifyError: null as string | null,
    productsCount: 0,
  };

  if (shopDomain && items.length) {
    // Robust offline session lookup
    const sess = await prisma.session.findFirst({
      where: {
        OR: [
          { shop: shopDomain, isOnline: false },
          { id: `offline_${shopDomain}` },
        ],
      },
      orderBy: [{ expires: "desc" }, { id: "desc" }],
      select: { id: true, shop: true, isOnline: true, accessToken: true, updatedAt: true },
    });

    debug.sessionId = sess?.id ?? null;
    debug.sessionShop = sess?.shop ?? null;
    debug.sessionIsOnline = sess?.isOnline ?? null;

    const token = sess?.accessToken ?? null;
    debug.hasToken = !!token;

    // Always compute admin urls even if GraphQL fails
    const storeHandle = storeHandleFromDomain(shopDomain);

    // Initialize with minimal product rows (fallback)
    products = items.map((it) => {
      const numeric = numericIdFromProductId(it.productId);
      const adminUrl = numeric ? `https://admin.shopify.com/store/${storeHandle}/products/${numeric}` : null;

      return {
        productId: it.productId,
        variantId: it.variantId ?? null,
        qty: it.qty,
        title: null,
        imageUrl: null,
        adminUrl,
        storefrontUrl: null,
      };
    });

    if (token) {
      const uniqueProductGids = Array.from(
        new Set(items.map((it) => asShopifyGid("Product", it.productId)).filter(Boolean) as string[])
      );

      if (uniqueProductGids.length) {
        try {
          const { json, apiVersion } = await shopifyGraphqlWithFallback(
            shopDomain,
            token,
            `#graphql
            query ProductCards($ids: [ID!]!) {
              shop { primaryDomain { url } }
              nodes(ids: $ids) {
                ... on Product {
                  id
                  title
                  handle
                  featuredImage { url }
                  images(first: 1) { nodes { url } }
                }
              }
            }`,
            { ids: uniqueProductGids }
          );

          debug.apiVersion = apiVersion;

          const baseStoreUrl: string | null = json?.data?.shop?.primaryDomain?.url ?? null;

          const byGid = new Map<string, any>();
          for (const n of json?.data?.nodes ?? []) {
            if (n?.id) byGid.set(n.id, n);
          }

          products = items.map((it) => {
            const gid = asShopifyGid("Product", it.productId);
            const p = gid ? byGid.get(gid) : null;

            const title = p?.title ?? null;
            const handle = p?.handle ?? null;
            const imageUrl = p?.featuredImage?.url ?? p?.images?.nodes?.[0]?.url ?? null;

            const numeric = numericIdFromProductId(it.productId);
            const adminUrl = numeric ? `https://admin.shopify.com/store/${storeHandle}/products/${numeric}` : null;
            const storefrontUrl = baseStoreUrl && handle ? `${baseStoreUrl}/products/${handle}` : null;

            return {
              productId: it.productId,
              variantId: it.variantId ?? null,
              qty: it.qty,
              title,
              imageUrl,
              adminUrl,
              storefrontUrl,
            };
          });
        } catch (e: any) {
          debug.shopifyError = e?.message || "Shopify enrichment failed";
          console.error("[orders] Shopify enrichment failed:", debug.shopifyError);
        }
      } else {
        debug.shopifyError = "No valid product IDs found to enrich";
      }
    } else {
      debug.shopifyError = "No offline Shopify session token found";
      console.error("[orders] Missing Shopify token for:", shopDomain);
    }
  } else {
    debug.shopifyError = !shopDomain ? "Missing shopDomain" : "No items on request";
  }

  debug.productsCount = products.length;

  return NextResponse.json({
    request: {
      id: r.id,
      status: r.status,
      roleType: r.roleType,
      createdAt: r.createdAt.toISOString(),
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone,
      address: r.address,
      wilayaName,
      communeName,
      items, // raw
      products, // enriched + fallback adminUrl always
      attachments,
      values: r.values ?? null,
      shopDomain: shopDomain ?? null,
    },
    debug: process.env.NODE_ENV === "production" ? undefined : debug,
  });
}
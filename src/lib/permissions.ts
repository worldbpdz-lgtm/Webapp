export type MemberRole = "owner" | "admin" | "member";

export type Permissions = {
  pages: {
    orders: boolean;
    reviews: boolean;
    analytics: boolean;
    trash: boolean;
    team: boolean;
    settings: boolean;
  };

  orders: {
    confirm: boolean;
    decline: boolean;
    moveToReview: boolean;
    archive: boolean; // “Delete” on confirmed/declined => move to trash (archived)
  };

  trash: {
    restore: boolean;
    hardDelete: boolean; // delete permanently
    bulk: boolean;
  };

  reviews: {
    approve: boolean;
    reject: boolean;
    restore: boolean;
    hardDelete: boolean; // delete permanently
  };

  team: {
    manage: boolean; // invite/update/remove members
  };

  settings: {
    manage: boolean;
  };
};

export const OWNER_PERMS: Permissions = {
  pages: { orders: true, reviews: true, analytics: true, trash: true, team: true, settings: true },
  orders: { confirm: true, decline: true, moveToReview: true, archive: true },
  trash: { restore: true, hardDelete: true, bulk: true },
  reviews: { approve: true, reject: true, restore: true, hardDelete: true },
  team: { manage: true },
  settings: { manage: true },
};

export const STAFF_PERMS: Permissions = {
  pages: { orders: true, reviews: true, analytics: true, trash: true, team: false, settings: false },
  orders: { confirm: true, decline: true, moveToReview: true, archive: true },
  trash: { restore: true, hardDelete: false, bulk: true },
  reviews: { approve: true, reject: true, restore: true, hardDelete: false },
  team: { manage: false },
  settings: { manage: false },
};

export function permsForRole(role: MemberRole): Permissions {
  if (role === "owner") return OWNER_PERMS;
  if (role === "admin") return OWNER_PERMS; // you can later reduce admin if you want
  return STAFF_PERMS;
}

function b(v: any, fallback: boolean) {
  return typeof v === "boolean" ? v : fallback;
}

/** Normalize & enforce consistency (pages off => actions off). */
export function normalizePermissions(raw: any, role: MemberRole): Permissions {
  const base = permsForRole(role);

  const p: Permissions = {
    pages: {
      orders: b(raw?.pages?.orders, base.pages.orders),
      reviews: b(raw?.pages?.reviews, base.pages.reviews),
      analytics: b(raw?.pages?.analytics, base.pages.analytics),
      trash: b(raw?.pages?.trash, base.pages.trash),
      team: b(raw?.pages?.team, base.pages.team),
      settings: b(raw?.pages?.settings, base.pages.settings),
    },
    orders: {
      confirm: b(raw?.orders?.confirm, base.orders.confirm),
      decline: b(raw?.orders?.decline, base.orders.decline),
      moveToReview: b(raw?.orders?.moveToReview, base.orders.moveToReview),
      archive: b(raw?.orders?.archive, base.orders.archive),
    },
    trash: {
      restore: b(raw?.trash?.restore, base.trash.restore),
      hardDelete: b(raw?.trash?.hardDelete, base.trash.hardDelete),
      bulk: b(raw?.trash?.bulk, base.trash.bulk),
    },
    reviews: {
      approve: b(raw?.reviews?.approve, base.reviews.approve),
      reject: b(raw?.reviews?.reject, base.reviews.reject),
      restore: b(raw?.reviews?.restore, base.reviews.restore),
      hardDelete: b(raw?.reviews?.hardDelete, base.reviews.hardDelete),
    },
    team: { manage: b(raw?.team?.manage, base.team.manage) },
    settings: { manage: b(raw?.settings?.manage, base.settings.manage) },
  };

  // ✅ Consistency: if page is off, kill its actions
  if (!p.pages.orders) p.orders = { confirm: false, decline: false, moveToReview: false, archive: false };
  if (!p.pages.trash) p.trash = { restore: false, hardDelete: false, bulk: false };
  if (!p.pages.reviews) p.reviews = { approve: false, reject: false, restore: false, hardDelete: false };

  // If manage is on, page must be on
  if (p.team.manage) p.pages.team = true;
  if (p.settings.manage) p.pages.settings = true;

  return p;
}
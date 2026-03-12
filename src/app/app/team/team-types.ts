// src/app/app/team/team-types.ts

export type ViewerPerms = {
  pages?: {
    orders?: boolean;
    reviews?: boolean;
    analytics?: boolean;
    team?: boolean;
    trash?: boolean;
    settings?: boolean;
  };

  orders?: {
    confirm?: boolean;
    decline?: boolean;
    moveToReview?: boolean;
    archive?: boolean;
  };

  reviews?: {
    approve?: boolean;
    reject?: boolean;
    edit?: boolean;
    delete?: boolean;
    restore?: boolean;
    hardDelete?: boolean;
  };

  trash?: {
    restore?: boolean;
    hardDelete?: boolean;
    bulk?: boolean;
  };

  analytics?: {
    view?: boolean;
  };

  team?: {
    view?: boolean;
    manage?: boolean;
  };

  settings?: {
    manage?: boolean;
  };
};

export type TeamMember = {
  id: string;
  shopId: string;
  email: string;
  name: string | null;
  role: string; // "owner" | "admin" | "staff"
  perms: ViewerPerms;
  createdAt: string;
  updatedAt: string | null;
};
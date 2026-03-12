"use client";

import React, { createContext, useContext } from "react";
import type { Permissions } from "@/lib/permissions";
import { OWNER_PERMS } from "@/lib/permissions";

const Ctx = createContext<Permissions>(OWNER_PERMS);

export function PermissionsProvider({
  value,
  children,
}: {
  value: Permissions;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePermissions() {
  return useContext(Ctx);
}
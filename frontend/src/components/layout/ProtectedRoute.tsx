import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import type { Role } from "@/types";

const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 3,
  informaticien: 2,
  demandeur: 1,
};

interface Props {
  minRole?: Role;
  redirectTo?: string;
}

export function ProtectedRoute({ minRole = "demandeur", redirectTo = "/tickets" }: Props) {
  const { user, refreshToken } = useAuthStore();

  // Gated on the refresh token, not the access token: the access token is
  // memory-only, so after a reload it is briefly null while the session is
  // still perfectly valid. Gating on it would bounce the user to /login on
  // every refresh. The first API call transparently mints a new one.
  if (!refreshToken || !user) return <Navigate to="/login" replace />;

  if (ROLE_HIERARCHY[user.role] < ROLE_HIERARCHY[minRole]) {
    return <Navigate to={redirectTo} replace />;
  }

  return <Outlet />;
}

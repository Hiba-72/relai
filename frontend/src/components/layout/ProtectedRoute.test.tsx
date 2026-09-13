import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import type { Role, UserRead } from "@/types";

function signIn(role: Role) {
  const user: UserRead = {
    id: "00000000-0000-0000-0000-000000000001",
    email: `${role}@relai-test.fr`,
    full_name: "Test User",
    role,
    is_active: true,
    poste_id: null,
  };
  // The refresh token is what the guard reads — the access token is
  // memory-only and is legitimately null right after a reload.
  useAuthStore.setState({ user, refreshToken: "refresh-token", accessToken: null });
}

/** Mirrors App.tsx: tickets open to any authenticated user, inventory behind
 *  a role floor. The redirect target must sit outside the guarded group, or a
 *  rejected user bounces into the same guard again. */
function renderAt(path: string, minRole?: Role) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/tickets" element={<p>tickets</p>} />
        </Route>
        <Route element={<ProtectedRoute minRole={minRole} />}>
          <Route path="/equipements" element={<p>inventory</p>} />
        </Route>
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuthStore.setState({ user: null, refreshToken: null, accessToken: null });
});

describe("ProtectedRoute", () => {
  it("sends a signed-out visitor to the login page", () => {
    renderAt("/tickets");
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("sends someone with a token but no cached user to login", () => {
    useAuthStore.setState({ refreshToken: "refresh-token", user: null });
    renderAt("/tickets");
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("lets a signed-in user through on a route with no role floor", () => {
    signIn("demandeur");
    renderAt("/tickets");
    expect(screen.getByText("tickets")).toBeInTheDocument();
  });

  it("admits a session whose access token is null after a reload", () => {
    // Gating on the access token instead would bounce every user to /login on
    // every page refresh, while their session was still perfectly valid.
    signIn("informaticien");
    expect(useAuthStore.getState().accessToken).toBeNull();
    renderAt("/equipements", "informaticien");
    expect(screen.getByText("inventory")).toBeInTheDocument();
  });
});

describe("ProtectedRoute role hierarchy", () => {
  it("keeps ward staff out of the inventory", () => {
    signIn("demandeur");
    renderAt("/equipements", "informaticien");
    expect(screen.queryByText("inventory")).not.toBeInTheDocument();
    expect(screen.getByText("tickets")).toBeInTheDocument();
  });

  it("lets a technician into the inventory", () => {
    signIn("informaticien");
    renderAt("/equipements", "informaticien");
    expect(screen.getByText("inventory")).toBeInTheDocument();
  });

  it("lets an admin into a technician route, because the floor is a minimum", () => {
    signIn("admin");
    renderAt("/equipements", "informaticien");
    expect(screen.getByText("inventory")).toBeInTheDocument();
  });

  it("keeps a technician out of an admin route", () => {
    signIn("informaticien");
    renderAt("/equipements", "admin");
    expect(screen.queryByText("inventory")).not.toBeInTheDocument();
  });

  // The guard is convenience, not security: every one of these rules is
  // enforced again server-side by require_roles(). See backend/tests.
});

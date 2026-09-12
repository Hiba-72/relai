import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role, UserRead } from "@/types";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserRead | null;
  setTokens: (access: string, refresh: string) => void;
  setUser: (user: UserRead) => void;
  logout: () => void;
}

export type { Role };

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setTokens: (access, refresh) => set({ accessToken: access, refreshToken: refresh }),
      setUser: (user) => set({ user }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    {
      name: "auth",
      // The access token is deliberately NOT persisted: it lives in memory
      // only, so it dies with the tab and is never readable from disk by
      // anything that can reach localStorage. Only the refresh token (the
      // credential the server can revoke) and the cached user survive a
      // reload — on the next request the 401 interceptor in api/client.ts
      // exchanges the refresh token for a fresh access token.
      partialize: (state) => ({
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    }
  )
);

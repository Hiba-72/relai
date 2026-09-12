import axios from "axios";
import { useAuthStore } from "@/store/authStore";

export const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401.
//
// While one refresh is in flight, other 401s park here instead of firing
// their own refresh. Each waiter carries both callbacks: a failed refresh has
// to *reject* them, otherwise those requests hang unsettled for the lifetime
// of the page.
let isRefreshing = false;
let queue: Array<{
  resolve: (token: string) => void;
  reject: (reason: unknown) => void;
}> = [];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          },
          reject,
        });
      });
    }

    const refreshToken = useAuthStore.getState().refreshToken;
    // No refresh token means there is no session to recover — sending
    // `{refresh_token: null}` would just earn a second 401.
    if (!refreshToken) {
      useAuthStore.getState().logout();
      return Promise.reject(error);
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const { data } = await axios.post("/api/v1/auth/refresh", { refresh_token: refreshToken });
      useAuthStore.getState().setTokens(data.access_token, data.refresh_token);
      queue.forEach((waiter) => waiter.resolve(data.access_token));
      queue = [];
      original.headers.Authorization = `Bearer ${data.access_token}`;
      return api(original);
    } catch (refreshError) {
      // Settle everyone that was waiting on this refresh before giving up.
      queue.forEach((waiter) => waiter.reject(refreshError));
      queue = [];
      useAuthStore.getState().logout();
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  }
);

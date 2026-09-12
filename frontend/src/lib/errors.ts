import { AxiosError } from "axios";

/** Shape of a FastAPI error body: `detail` is a string, or a validation list. */
type ApiErrorBody = {
  detail?: string | Array<{ msg?: string }>;
};

/**
 * Extract a displayable message from a failed API call.
 *
 * Replaces the `(e: any) => e?.response?.data?.detail ?? "..."` that was
 * repeated at every call site. Beyond typing it, this handles the case that
 * spelling missed: FastAPI returns a 422's `detail` as a list of validation
 * objects, so the old code passed an array straight to the toast and rendered
 * "[object Object]" instead of the reason the request was rejected.
 */
export function apiError(err: unknown, fallback = "Erreur."): string {
  const detail = (err as AxiosError<ApiErrorBody>)?.response?.data?.detail;

  if (typeof detail === "string" && detail.trim()) return detail;

  if (Array.isArray(detail)) {
    const messages = detail.map((d) => d?.msg).filter(Boolean);
    if (messages.length) return messages.join(" · ");
  }

  return fallback;
}

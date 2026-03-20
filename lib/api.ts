import type { Session } from "@supabase/supabase-js";

const getApiUrl = (): string => {
  const url = String(process.env.EXPO_PUBLIC_API_URL ?? "").trim();
  return url.replace(/\/+$/, "");
};

type ApiFetchOptions = {
  session?: Session | null;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const apiUrl = getApiUrl();
  if (!apiUrl) {
    throw new Error("Missing EXPO_PUBLIC_API_URL");
  }
  const { session, method = "GET", body, headers: extraHeaders, timeoutMs } = options;
  const headers: Record<string, string> = { ...extraHeaders };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  if (body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const fetchOptions: RequestInit = {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
  if (timeoutMs && typeof AbortController !== "undefined") {
    const controller = new AbortController();
    fetchOptions.signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${apiUrl}${path}`, fetchOptions);
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }
  return fetch(`${apiUrl}${path}`, fetchOptions);
}

export async function apiFetchJson<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

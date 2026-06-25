// In dev, VITE_API_URL is unset -> calls go to "/api" (Vite proxies to :8000).
// In production (Vercel), set VITE_API_URL to the Render backend URL, e.g.
// https://perch-backend.onrender.com -> calls go to that host's /api.
const BASE = (import.meta.env.VITE_API_URL || "") + "/api";

async function request(path, options) {
  const res = await fetch(BASE + path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export const api = {
  health: () => request("/health"),
  runInfo: () => request("/run-info"),
  universe: () => request("/universe"),
  etf: (ticker) => request(`/etf/${ticker}`),
  plans: (body) =>
    request("/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  refresh: (synthetic) =>
    request(`/refresh?synthetic=${synthetic ? "true" : "false"}`, {
      method: "POST",
    }),
};

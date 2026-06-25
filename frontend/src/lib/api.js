const BASE = "/api";

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

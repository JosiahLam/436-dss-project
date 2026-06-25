export const money = (n, digits = 0) =>
  n == null
    ? "—"
    : n.toLocaleString("en-CA", {
        style: "currency",
        currency: "CAD",
        maximumFractionDigits: digits,
      });

export const pct = (n, digits = 1) =>
  n == null ? "—" : `${(n * 100).toFixed(digits)}%`;

export const RISK_STYLES = {
  Safe: { dot: "bg-emerald-400", text: "text-emerald-300", ring: "border-emerald-500/40 bg-emerald-500/10" },
  Watch: { dot: "bg-amber-400", text: "text-amber-300", ring: "border-amber-500/40 bg-amber-500/10" },
  Risky: { dot: "bg-rose-400", text: "text-rose-300", ring: "border-rose-500/40 bg-rose-500/10" },
};

export const PLAN_ACCENT = {
  Safe: "text-emerald-300",
  Balanced: "text-sky-300",
  "High-risk": "text-amber-300",
};

// Chart colors (work on the dark canvas).
export const CATEGORY_COLORS = {
  covered_call: "#fbbf24",
  equity_income: "#38bdf8",
  bond: "#34d399",
  reit: "#a78bfa",
};

export const RISK_COLORS = {
  Safe: "#34d399",
  Watch: "#fbbf24",
  Risky: "#fb7185",
};

export const CATEGORY_LABELS = {
  covered_call: "Covered call",
  equity_income: "Equity income",
  bond: "Bond",
  reit: "REIT",
};

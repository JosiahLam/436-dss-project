import { useMemo, useState } from "react";
import RiskBadge from "./RiskBadge";

const HORIZONS = [
  { v: 6, label: "6 months" },
  { v: 12, label: "1 year" },
  { v: 24, label: "2 years" },
  { v: 36, label: "3 years" },
  { v: 60, label: "5 years" },
];

const CATEGORIES = [
  ["covered_call", "Covered call"],
  ["equity_income", "Equity income"],
  ["bond", "Bond"],
  ["reit", "REIT"],
];

// Registered accounts that take a contribution-room input.
const REGISTERED = [
  ["tfsa", "TFSA"],
  ["rrsp", "RRSP"],
  ["fhsa", "FHSA"],
];

export default function PlanBuilder({
  etfs,
  onBuild,
  loading,
  budget,
  setBudget,
  incomeGoal,
  setIncomeGoal,
  ctaLabel = "Build 3 plans",
}) {
  const [sel, setSel] = useState({}); // ticker -> 'include' | 'exclude'
  const [horizon, setHorizon] = useState(12);
  const [maxWeight, setMaxWeight] = useState(35);
  const [catCaps, setCatCaps] = useState({});
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState({}); // category -> expanded?
  // Non-registered defaults on: anyone can open an unlimited taxable account, so
  // it's the natural overflow destination. Users can still uncheck it to see a
  // registered-only split.
  const [acctHeld, setAcctHeld] = useState({ non_registered: true });
  const [acctRoom, setAcctRoom] = useState({}); // 'tfsa'|'rrsp'|'fhsa' -> room string

  const grouped = useMemo(() => {
    const g = { covered_call: [], equity_income: [], bond: [], reit: [] };
    etfs.forEach((e) => g[e.category]?.push(e));
    return g;
  }, [etfs]);

  const q = query.trim().toLowerCase();
  const match = (list) =>
    !q ? list : list.filter((e) => (e.ticker + " " + e.name).toLowerCase().includes(q));

  // selection helpers
  const setOne = (t, state) =>
    setSel((s) => {
      const n = { ...s };
      if (s[t] === state) delete n[t];
      else n[t] = state;
      return n;
    });
  const removeOne = (t) => setSel((s) => { const n = { ...s }; delete n[t]; return n; });
  const bulk = (list, state) =>
    setSel((s) => { const n = { ...s }; list.forEach((e) => (n[e.ticker] = state)); return n; });
  const clearCat = (list) =>
    setSel((s) => { const n = { ...s }; list.forEach((e) => delete n[e.ticker]); return n; });

  const include = Object.keys(sel).filter((t) => sel[t] === "include");
  const exclude = Object.keys(sel).filter((t) => sel[t] === "exclude");
  const validBudget = Number(budget) > 0;

  const setCap = (cat, val) =>
    setCatCaps((c) => {
      const n = { ...c };
      if (val === "" || val == null) delete n[cat];
      else n[cat] = Number(val);
      return n;
    });

  const toggleAcct = (t) =>
    setAcctHeld((s) => {
      const n = { ...s };
      if (n[t]) delete n[t];
      else n[t] = true;
      return n;
    });

  // Build the accounts object only if at least one account is selected.
  const buildAccounts = () => {
    const anyHeld = REGISTERED.some(([k]) => acctHeld[k]) || acctHeld.non_registered;
    if (!anyHeld) return null;
    const acc = { has_non_registered: !!acctHeld.non_registered };
    REGISTERED.forEach(([k]) => {
      acc[`${k}_room`] = acctHeld[k] && acctRoom[k] !== "" && acctRoom[k] != null
        ? Number(acctRoom[k])
        : null;
    });
    return acc;
  };

  const submit = () => {
    const category_caps = Object.fromEntries(
      Object.entries(catCaps).map(([k, v]) => [k, v / 100])
    );
    const accounts = buildAccounts();
    onBuild({
      budget: Number(budget),
      include,
      exclude,
      horizon_months: Number(horizon),
      max_weight: maxWeight / 100,
      category_caps: Object.keys(category_caps).length ? category_caps : null,
      ...(accounts ? { accounts } : {}),
    });
  };

  const nameOf = (t) => etfs.find((e) => e.ticker === t)?.ticker.replace(".TO", "") || t;

  return (
    <section className="card p-5">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Build your income plan</h2>
          <p className="text-sm text-slate-400">
            Enter a budget and tune the controls. We screen out cut-risk funds, then optimize.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Amount to invest</label>
            <div className="mt-1 flex items-center">
              <span className="mr-1 text-slate-400">$</span>
              <input
                className="input w-40"
                type="number"
                min="1000"
                step="1000"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            {!validBudget && <p className="mt-1 text-[11px] text-rose-300">Enter an amount above $0.</p>}
          </div>
          {setIncomeGoal && (
            <div>
              <label className="label">Monthly income goal (optional)</label>
              <div className="mt-1 flex items-center">
                <span className="mr-1 text-slate-400">$</span>
                <input
                  className="input w-36"
                  type="number"
                  min="0"
                  step="50"
                  placeholder="e.g. 300"
                  value={incomeGoal ?? ""}
                  onChange={(e) => setIncomeGoal(e.target.value)}
                />
              </div>
            </div>
          )}
          <button className="btn-primary" onClick={submit} disabled={loading || !validBudget}>
            {loading ? "Optimizing…" : ctaLabel}
          </button>
        </div>
      </div>

      {/* Advanced controls */}
      <div className="mt-5 grid gap-4 border-t border-edge pt-4 md:grid-cols-3">
        <div>
          <label className="label">Time horizon</label>
          <select className="input mt-1 w-full" value={horizon} onChange={(e) => setHorizon(e.target.value)}>
            {HORIZONS.map((h) => <option key={h.v} value={h.v}>{h.label}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-slate-500">Longer horizons unlock more of the risk budget — gains taper off past a few years.</p>
        </div>
        <div>
          <label className="label">Max per fund · {maxWeight}%</label>
          <input className="mt-3 w-full accent-brand" type="range" min="10" max="50" step="5"
                 value={maxWeight} onChange={(e) => setMaxWeight(Number(e.target.value))} />
          <p className="mt-1 text-[11px] text-slate-500">Diversification cap on any single ETF.</p>
        </div>
        <div>
          <label className="label">Category caps (optional)</label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {CATEGORIES.map(([key, name]) => (
              <div key={key} className="flex items-center gap-1">
                <input className="input w-14 px-2 py-1 text-sm" type="number" min="0" max="100"
                       placeholder="—" value={catCaps[key] ?? ""} onChange={(e) => setCap(key, e.target.value)} />
                <span className="text-[11px] text-slate-400">% {name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tax-advantaged accounts */}
      <div className="mt-5 border-t border-edge pt-4">
        <label className="label">Accounts you hold (optional)</label>
        <p className="mt-1 text-[11px] text-slate-500">
          Tell us which registered accounts you have and how much contribution room is left.
          We'll show how to split each plan to shelter the most heavily taxed income first.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {REGISTERED.map(([key, name]) => (
            <div key={key} className="rounded-xl border border-edge bg-panel2 p-3">
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  className="accent-brand"
                  checked={!!acctHeld[key]}
                  onChange={() => toggleAcct(key)}
                />
                {name}
              </label>
              {acctHeld[key] && (
                <div className="mt-2 flex items-center">
                  <span className="mr-1 text-slate-400">$</span>
                  <input
                    className="input w-full px-2 py-1 text-sm"
                    type="number"
                    min="0"
                    step="500"
                    placeholder="room"
                    value={acctRoom[key] ?? ""}
                    onChange={(e) =>
                      setAcctRoom((r) => ({ ...r, [key]: e.target.value }))
                    }
                  />
                </div>
              )}
            </div>
          ))}
          <div className="rounded-xl border border-edge bg-panel2 p-3">
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                className="accent-brand"
                checked={!!acctHeld.non_registered}
                onChange={() => toggleAcct("non_registered")}
              />
              Non-registered
            </label>
            <p className="mt-2 text-[11px] text-slate-500">Taxable account for any overflow.</p>
          </div>
        </div>
      </div>

      {/* Fund selection */}
      <div className="mt-5 border-t border-edge pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <label className="label">Pin or drop funds (optional)</label>
            <p className="mt-1 text-[11px] text-slate-500">Pin forces a fund into consideration (even if flagged Risky); it doesn't guarantee a non-zero weight. Drop excludes it entirely.</p>
          </div>
          <input
            className="input w-56 px-3 py-1.5 text-sm"
            placeholder="Search ticker or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Current selection summary */}
        {(include.length > 0 || exclude.length > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-panel2 p-3 text-sm">
            {include.map((t) => (
              <Chip key={t} color="emerald" onRemove={() => removeOne(t)}>📌 {nameOf(t)}</Chip>
            ))}
            {exclude.map((t) => (
              <Chip key={t} color="rose" onRemove={() => removeOne(t)}>🚫 {nameOf(t)}</Chip>
            ))}
            <button className="ml-auto text-xs text-slate-400 hover:text-slate-200" onClick={() => setSel({})}>
              Reset all
            </button>
          </div>
        )}

        {/* Category accordions */}
        <div className="mt-3 space-y-2">
          {CATEGORIES.map(([key, name]) => {
            const all = grouped[key] || [];
            const list = match(all);
            if (q && list.length === 0) return null;
            const expanded = q ? true : !!open[key];
            const inc = all.filter((e) => sel[e.ticker] === "include").length;
            const exc = all.filter((e) => sel[e.ticker] === "exclude").length;
            return (
              <div key={key} className="overflow-hidden rounded-xl border border-edge">
                <div className="flex items-center justify-between bg-panel2 px-3 py-2">
                  <button
                    className="flex items-center gap-2 text-sm font-medium text-slate-100"
                    onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                  >
                    <span className="text-slate-500">{expanded ? "▾" : "▸"}</span>
                    {name}
                    <span className="text-xs font-normal text-slate-500">· {all.length} funds</span>
                    {inc > 0 && <span className="text-xs text-emerald-300">· {inc} pinned</span>}
                    {exc > 0 && <span className="text-xs text-rose-300">· {exc} dropped</span>}
                  </button>
                  <div className="flex items-center gap-2 text-xs">
                    <button className="text-emerald-300 hover:underline" title="Force all funds in this category into the optimizer's candidate list — the optimizer may still assign them 0% if not favoured." onClick={() => bulk(all, "include")}>Pin all</button>
                    <button className="text-rose-300 hover:underline" onClick={() => bulk(all, "exclude")}>Drop all</button>
                    <button className="text-slate-400 hover:underline" onClick={() => clearCat(all)}>Clear</button>
                  </div>
                </div>
                {expanded && (
                  <div className="divide-y divide-edge/50">
                    {list.map((e) => (
                      <div key={e.ticker} className="flex items-center justify-between px-3 py-2">
                        <div className="min-w-0">
                          <span className="font-medium text-slate-100">{e.ticker.replace(".TO", "")}</span>
                          <span className="ml-2 truncate text-xs text-slate-500">{e.name}</span>
                          {!e.eligible && <span className="ml-2 text-[11px] text-amber-400/80">screened out</span>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <RiskBadge risk={e.risk_category} eligible={e.eligible} screenReason={e.screen_reason} />
                          <div className="flex overflow-hidden rounded-lg border border-edge">
                            <Seg active={sel[e.ticker] === "include"} color="emerald" onClick={() => setOne(e.ticker, "include")} title="Force this fund into the optimizer's candidate list — the optimizer may still assign it 0% if not favoured.">Pin</Seg>
                            <Seg active={sel[e.ticker] === "exclude"} color="rose" onClick={() => setOne(e.ticker, "exclude")}>Drop</Seg>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Seg({ active, color, onClick, children, title }) {
  const on =
    color === "emerald"
      ? "bg-emerald-500/20 text-emerald-200"
      : "bg-rose-500/20 text-rose-200";
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-3 py-1 text-xs font-medium transition ${active ? on : "text-slate-400 hover:bg-panel2"}`}
    >
      {children}
    </button>
  );
}

function Chip({ color, onRemove, children }) {
  const c = color === "emerald"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
    : "border-rose-500/40 bg-rose-500/10 text-rose-200";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${c}`}>
      {children}
      <button className="opacity-70 hover:opacity-100" onClick={onRemove}>×</button>
    </span>
  );
}

import { useMemo, useState } from "react";
import { pct, money, CATEGORY_LABELS } from "../lib/format";
import RiskBadge from "./RiskBadge";

const CATS = ["covered_call", "equity_income", "bond", "reit"];
const RISKS = ["Safe", "Watch", "Risky"];

function ProbBar({ p }) {
  const color = p >= 0.55 ? "bg-rose-400" : p >= 0.25 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-panel2">
        <div className={`h-full ${color}`} style={{ width: `${Math.round((p || 0) * 100)}%` }} />
      </div>
      <span className="tabular-nums text-slate-400">{pct(p, 0)}</span>
    </div>
  );
}
function Trend({ v }) {
  if (v == null) return <span className="text-slate-500">—</span>;
  const up = v >= 0;
  return <span className={up ? "text-emerald-300" : "text-rose-300"}>{up ? "▲" : "▼"} {pct(Math.abs(v), 1)}</span>;
}

const COLUMNS = [
  { key: "ticker", label: "ETF", align: "left" },
  { key: "category_label", label: "Type", align: "left" },
  { key: "prob_cut", label: "Cut probability", align: "left", num: true },
  { key: "dist_yield", label: "Yield", align: "right", num: true },
  { key: "payout_trend", label: "Payout trend", align: "right", num: true },
  { key: "last_price", label: "Price", align: "right", num: true },
];

// Filterable / sortable / searchable view of the whole scored universe.
export default function UniverseExplorer({ etfs, onSelect }) {
  const [cats, setCats] = useState(new Set());
  const [risks, setRisks] = useState(new Set());
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "prob_cut", dir: "desc" });

  const toggle = (set, val, setter) => {
    const n = new Set(set);
    n.has(val) ? n.delete(val) : n.add(val);
    setter(n);
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = etfs.filter((e) => {
      if (cats.size && !cats.has(e.category)) return false;
      if (risks.size && !risks.has(e.risk_category)) return false;
      if (eligibleOnly && !e.eligible) return false;
      if (needle && !(e.ticker + " " + e.name).toLowerCase().includes(needle)) return false;
      return true;
    });
    const { key, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return mul * av.localeCompare(bv);
      return mul * (av - bv);
    });
    return out;
  }, [etfs, cats, risks, eligibleOnly, q, sort]);

  const onSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Explore the screened universe</h2>
          <p className="text-sm text-slate-400">
            Filter, sort, and search all {etfs.length} scored funds to find ones that fit your goals.
          </p>
        </div>
        <input
          className="input w-56 px-3 py-1.5 text-sm"
          placeholder="Search ticker or name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {CATS.map((c) => (
          <FilterChip key={c} active={cats.has(c)} onClick={() => toggle(cats, c, setCats)}>
            {CATEGORY_LABELS[c]}
          </FilterChip>
        ))}
        <span className="mx-1 h-4 w-px bg-edge" />
        {RISKS.map((r) => (
          <FilterChip key={r} active={risks.has(r)} onClick={() => toggle(risks, r, setRisks)}>
            {r}
          </FilterChip>
        ))}
        <span className="mx-1 h-4 w-px bg-edge" />
        <FilterChip active={eligibleOnly} onClick={() => setEligibleOnly((v) => !v)}>
          Eligible only
        </FilterChip>
        {(cats.size || risks.size || eligibleOnly || q) ? (
          <button
            className="ml-1 text-xs text-slate-400 hover:text-slate-200"
            onClick={() => { setCats(new Set()); setRisks(new Set()); setEligibleOnly(false); setQ(""); }}
          >
            Reset filters
          </button>
        ) : null}
        <span className="ml-auto text-xs text-slate-500">{rows.length} shown</span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-xs uppercase tracking-wider text-slate-400">
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => onSort(c.key)}
                  className={`cursor-pointer select-none py-2 hover:text-slate-200 ${c.align === "right" ? "px-3 text-right" : "px-3"} ${c.key === "ticker" ? "pr-3 pl-0" : ""}`}
                >
                  {c.label}
                  {sort.key === c.key && <span className="ml-1 text-slate-500">{sort.dir === "asc" ? "▲" : "▼"}</span>}
                </th>
              ))}
              <th className="px-3">Risk</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr
                key={e.ticker}
                onClick={() => onSelect(e.ticker)}
                className={`cursor-pointer border-b border-edge/50 hover:bg-panel2 ${e.eligible ? "" : "opacity-50"}`}
              >
                <td className="py-2.5 pr-3">
                  <div className="font-medium text-slate-100">{e.ticker.replace(".TO", "")}</div>
                  <div className="text-xs text-slate-500">{e.name}</div>
                </td>
                <td className="px-3 text-slate-300">{e.category_label}</td>
                <td className="px-3"><ProbBar p={e.prob_cut} /></td>
                <td className="px-3 text-right tabular-nums text-slate-200">{pct(e.dist_yield, 1)}</td>
                <td className="px-3 text-right tabular-nums"><Trend v={e.payout_trend} /></td>
                <td className="px-3 text-right tabular-nums text-slate-300">{money(e.last_price, 2)}</td>
                <td className="px-3"><RiskBadge risk={e.risk_category} eligible={e.eligible} screenReason={e.screen_reason} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-sm text-slate-500">No funds match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        active ? "border-brand/50 bg-brand/15 text-brand" : "border-edge text-slate-400 hover:bg-panel2 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

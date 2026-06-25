import { pct, money } from "../lib/format";
import RiskBadge from "./RiskBadge";

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
  return (
    <span className={up ? "text-emerald-300" : "text-rose-300"}>
      {up ? "▲" : "▼"} {pct(Math.abs(v), 1)}
    </span>
  );
}

export default function UniverseTable({ etfs, onSelect }) {
  return (
    <section className="card p-5">
      <h2 className="text-lg font-semibold text-white">Screened universe & dividend-cut scores</h2>
      <p className="mb-3 text-sm text-slate-400">
        Every income ETF the model scored this run. Click a row for the fund's history and feature breakdown.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-xs uppercase tracking-wider text-slate-400">
              <th className="py-2 pr-3">ETF</th>
              <th className="px-3">Type</th>
              <th className="px-3">Risk</th>
              <th className="px-3">Cut probability</th>
              <th className="px-3 text-right">Yield</th>
              <th className="px-3 text-right">Payout trend</th>
              <th className="px-3 text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {etfs.map((e) => (
              <tr
                key={e.ticker}
                onClick={() => onSelect(e.ticker)}
                className={`cursor-pointer border-b border-edge/50 hover:bg-panel2 ${
                  e.eligible ? "" : "opacity-50"
                }`}
              >
                <td className="py-2.5 pr-3">
                  <div className="font-medium text-slate-100">{e.ticker.replace(".TO", "")}</div>
                  <div className="text-xs text-slate-500">{e.name}</div>
                  {!e.eligible && (
                    <div className="text-[11px] text-amber-400/80">screened out · {e.screen_reason}</div>
                  )}
                </td>
                <td className="px-3 text-slate-300">{e.category_label}</td>
                <td className="px-3"><RiskBadge risk={e.risk_category} /></td>
                <td className="px-3"><ProbBar p={e.prob_cut} /></td>
                <td className="px-3 text-right tabular-nums text-slate-200">{pct(e.dist_yield, 1)}</td>
                <td className="px-3 text-right tabular-nums"><Trend v={e.payout_trend} /></td>
                <td className="px-3 text-right tabular-nums text-slate-300">{money(e.last_price, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

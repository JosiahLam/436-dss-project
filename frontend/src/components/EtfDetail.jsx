import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { api } from "../lib/api";
import { pct, money } from "../lib/format";
import RiskBadge from "./RiskBadge";

// How each rank-bucket maps onto the cut-risk ranking (see config.EXCLUDE_PCT / WATCH_PCT).
const BUCKET_DESC = {
  Risky: "top 25% cut risk",
  Watch: "the 25–40% band",
  Safe: "the lower 60%",
};

export default function EtfDetail({ ticker, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    api.etf(ticker).then(setData).catch((e) => setError(e.message));
  }, [ticker]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="card max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {error && <p className="text-rose-300">{error}</p>}
        {!data && !error && <p className="text-slate-400">Loading {ticker}…</p>}
        {data && (
          <>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-semibold text-white">{data.ticker.replace(".TO", "")}</h3>
                  <RiskBadge risk={data.risk_category} eligible={data.eligible} screenReason={data.screen_reason} />
                </div>
                <p className="text-sm text-slate-400">
                  {data.name} · {data.category_label} · {data.provider}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-edge text-lg leading-none text-slate-400 hover:bg-panel2 hover:text-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Metric label="Cut probability" value={pct(data.prob_cut, 0)} />
              <Metric label="Trailing (TTM) yield" value={pct(data.dist_yield, 1)} />
              <Metric label="Payout trend (12m TTM)" value={pct(data.payout_trend, 1)} />
              <Metric label="Payout volatility (CV)" value={data.payout_stability?.toFixed(2) ?? "—"} />
            </div>

            <div className="mt-5 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.history} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#243352" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis yAxisId="p" stroke="#60a5fa" tick={{ fontSize: 11 }} width={48} />
                  <YAxis yAxisId="d" orientation="right" stroke="#34d399" tick={{ fontSize: 11 }} width={48} />
                  <Tooltip
                    contentStyle={{ background: "#16223c", border: "1px solid #243352", borderRadius: 12 }}
                  />
                  <Line yAxisId="p" type="monotone" dataKey="price" name="Price" stroke="#60a5fa" dot={false} />
                  <Line
                    yAxisId="d"
                    type="monotone"
                    dataKey="run_rate"
                    name="Distribution run-rate"
                    stroke="#34d399"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex gap-4 text-xs text-slate-400">
              <span><span className="text-sky-400">●</span> Price</span>
              <span><span className="text-emerald-400">●</span> Distribution run-rate ($/mo)</span>
            </div>

            <div className="mt-5 rounded-xl bg-panel2 p-4 text-sm text-slate-300">
              <div className="label mb-2">Why this score</div>

              {data.eligible && data.explain?.rank != null && (
                <p className="mb-2">
                  <b>{data.risk_category}</b> ({BUCKET_DESC[data.risk_category] || "ranked by cut risk"})
                  {" "}— this fund ranks <b>{data.explain.rank} of {data.explain.n}</b> by cut risk
                  {data.explain.pct != null && (
                    <> (top {Math.max(1, Math.round(data.explain.pct * 100))}%)</>
                  )}.
                </p>
              )}

              {data.explain?.drivers?.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4 text-slate-300">
                  {data.explain.drivers.map((d, i) => (
                    <li key={i}>{d.text}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-400">
                  No single feature stands out — this fund's cut risk is near the model's baseline.
                </p>
              )}

              {!data.eligible && (
                <p className="mt-2 text-slate-400">
                  Not rated for plans — screened out ({data.screen_reason}).
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg bg-panel2 px-3 py-2">
      <div className="label">{label}</div>
      <div className="mt-0.5 font-medium text-slate-100">{value}</div>
    </div>
  );
}

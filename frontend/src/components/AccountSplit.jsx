import { useState } from "react";
import { money, pct } from "../lib/format";

// Accent per account type, matching the dark-slate palette used elsewhere.
const ACCOUNT_ACCENT = {
  tfsa: "text-emerald-300",
  rrsp: "text-sky-300",
  fhsa: "text-violet-300",
  non_registered: "text-slate-300",
};

export default function AccountSplit({ allocation }) {
  const [showWhy, setShowWhy] = useState(false);
  if (!allocation) return null;
  const { accounts = [], summary, assumptions = [], disclaimer, sheltered_pct } = allocation;

  return (
    <div className="mt-4 border-t border-edge pt-3">
      <div className="flex items-center justify-between">
        <div className="label">Account split</div>
        {sheltered_pct != null && (
          <span className="text-[11px] text-slate-400">
            {pct(sheltered_pct, 0)} sheltered
          </span>
        )}
      </div>

      {summary && <p className="mt-1 text-[11px] leading-5 text-slate-400">{summary}</p>}

      <div className="mt-3 space-y-2">
        {accounts.map((acc) => {
          const accent = ACCOUNT_ACCENT[acc.type] || "text-slate-200";
          return (
            <div key={acc.type} className="overflow-hidden rounded-xl border border-edge">
              <div className="flex items-center justify-between bg-panel2 px-3 py-2">
                <span className={`text-sm font-medium ${accent}`}>{acc.label}</span>
                <span className="tabular-nums text-xs text-slate-400">
                  {money(acc.total)}
                  {acc.room != null && (
                    <span className="text-slate-500"> · room {money(acc.room)}</span>
                  )}
                </span>
              </div>
              {acc.holdings.length > 0 ? (
                <div className="divide-y divide-edge/50">
                  {acc.holdings.map((h, i) => (
                    <div key={`${h.ticker}-${i}`} className="px-3 py-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-100">
                          {(h.ticker || "").replace(".TO", "")}
                        </span>
                        <span className="tabular-nums text-slate-300">{money(h.amount)}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{h.reason}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-3 py-2 text-[11px] text-slate-500">No holdings placed here.</p>
              )}
            </div>
          );
        })}
      </div>

      {(assumptions.length > 0 || disclaimer) && (
        <div className="mt-3">
          {assumptions.length > 0 && (
            <button
              className="text-[11px] text-slate-400 hover:text-slate-200"
              onClick={() => setShowWhy((v) => !v)}
            >
              {showWhy ? "▾" : "▸"} Tax rules used
            </button>
          )}
          {showWhy && (
            <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] leading-4 text-slate-500">
              {assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
          {disclaimer && (
            <p className="mt-2 text-[11px] italic leading-4 text-slate-600">{disclaimer}</p>
          )}
        </div>
      )}
    </div>
  );
}

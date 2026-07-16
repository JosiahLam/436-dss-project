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
  const { accounts = [], summary, assumptions = [], disclaimer, sheltered_pct,
    tax_saved_annual } = allocation;
  const hasNotes = assumptions.length > 0 || disclaimer;

  return (
    <div className="mt-4 border-t border-edge pt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="label">Account split</div>
          {hasNotes && (
            <button
              type="button"
              aria-label="How these placements are decided"
              aria-expanded={showWhy}
              onClick={() => setShowWhy((v) => !v)}
              className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] leading-none transition-colors ${
                showWhy
                  ? "border-slate-400 text-slate-200"
                  : "border-slate-600 text-slate-500 hover:border-slate-400 hover:text-slate-300"
              }`}
            >
              i
            </button>
          )}
        </div>
        {sheltered_pct != null && (
          <span className="text-[11px] text-slate-400">
            {pct(sheltered_pct, 0)} sheltered
          </span>
        )}
      </div>

      {tax_saved_annual >= 1 && (
        <div className="mt-2 flex items-baseline gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2">
          <span className="tabular-nums text-lg font-semibold text-emerald-300">
            ≈ {money(tax_saved_annual)}
          </span>
          <span className="text-[11px] text-slate-400">/yr less tax vs. holding it all taxable</span>
        </div>
      )}

      {showWhy && hasNotes && (
        <div className="mt-2 rounded-lg border border-edge bg-panel2 px-3 py-2">
          {assumptions.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-[11px] leading-4 text-slate-400">
              {assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
          {disclaimer && (
            <p className="mt-2 text-[11px] italic leading-4 text-slate-500">{disclaimer}</p>
          )}
        </div>
      )}

      {summary && <p className="mt-1 text-[11px] leading-5 text-slate-400">{summary}</p>}

      <div className="mt-3 space-y-2">
        {accounts.map((acc) => {
          const accent = ACCOUNT_ACCENT[acc.type] || "text-slate-200";
          return (
            <div key={acc.type} className="overflow-hidden rounded-xl border border-edge">
              <div className="flex items-center justify-between bg-panel2 px-3 py-2">
                <span className="flex items-center gap-1.5">
                  <span className={`text-sm font-medium ${accent}`}>{acc.label}</span>
                  {acc.needs_account && (
                    <span className="rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-300/90">
                      you'd need to open this
                    </span>
                  )}
                </span>
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

    </div>
  );
}

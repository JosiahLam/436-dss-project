import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import RiskBadge from "../RiskBadge";
import InfoTip from "../InfoTip";
import { money } from "../../lib/format";
import { useCanAnimate } from "../../lib/ioSupport";

const STEPS = ["Investment", "Risk & style", "Accounts", "Review"];
const EST_MINUTES = 2;

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

const REGISTERED = [
  ["tfsa", "TFSA"],
  ["rrsp", "RRSP"],
  ["fhsa", "FHSA"],
];

// Purely illustrative, client-side only: which of the three plans a risk
// tolerance setting is closest to. Real assignment happens after Generate —
// this is just a live preview so the wizard feels responsive, not a fourth
// hidden model.
function guessPortfolioType(maxWeight, horizonMonths) {
  const score = maxWeight * 0.7 + Math.min(horizonMonths, 60) / 60 * 30;
  if (score < 30) return "Safe";
  if (score < 55) return "Balanced";
  return "High-risk";
}

export default function PlanWizard({ etfs, onBuild, loading, budget, setBudget, incomeGoal, setIncomeGoal, ctaLabel = "Generate My Income Plan" }) {
  const canAnimate = useCanAnimate();
  const [step, setStep] = useState(0);
  const [horizon, setHorizon] = useState(12);
  const [maxWeight, setMaxWeight] = useState(35);
  const [catCaps, setCatCaps] = useState({});
  const [maxFunds, setMaxFunds] = useState("");
  const [sel, setSel] = useState({});
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState({});
  const [showFundPicker, setShowFundPicker] = useState(false);
  const [acctHeld, setAcctHeld] = useState({ non_registered: true });
  const [acctRoom, setAcctRoom] = useState({});

  const grouped = useMemo(() => {
    const g = { covered_call: [], equity_income: [], bond: [], reit: [] };
    etfs.forEach((e) => g[e.category]?.push(e));
    return g;
  }, [etfs]);

  const q = query.trim().toLowerCase();
  const match = (list) => (!q ? list : list.filter((e) => (e.ticker + " " + e.name).toLowerCase().includes(q)));

  const setOne = (t, state) =>
    setSel((s) => {
      const n = { ...s };
      if (s[t] === state) delete n[t];
      else n[t] = state;
      return n;
    });
  const bulk = (list, state) => setSel((s) => { const n = { ...s }; list.forEach((e) => (n[e.ticker] = state)); return n; });
  const clearCat = (list) => setSel((s) => { const n = { ...s }; list.forEach((e) => delete n[e.ticker]); return n; });

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

  const buildAccounts = () => {
    const anyHeld = REGISTERED.some(([k]) => acctHeld[k]) || acctHeld.non_registered;
    if (!anyHeld) return null;
    const acc = { has_non_registered: !!acctHeld.non_registered };
    REGISTERED.forEach(([k]) => {
      acc[`${k}_room`] = acctHeld[k] && acctRoom[k] !== "" && acctRoom[k] != null ? Number(acctRoom[k]) : null;
    });
    return acc;
  };

  const submit = () => {
    const category_caps = Object.fromEntries(Object.entries(catCaps).map(([k, v]) => [k, v / 100]));
    const accounts = buildAccounts();
    onBuild({
      budget: Number(budget),
      include,
      exclude,
      horizon_months: Number(horizon),
      max_weight: maxWeight / 100,
      category_caps: Object.keys(category_caps).length ? category_caps : null,
      max_funds: maxFunds !== "" ? Number(maxFunds) : null,
      ...(accounts ? { accounts } : {}),
    });
  };

  const canAdvance = step === 0 ? validBudget : true;
  const portfolioType = guessPortfolioType(maxWeight, Number(horizon));
  const acctCount = REGISTERED.filter(([k]) => acctHeld[k]).length + (acctHeld.non_registered ? 1 : 0);

  const stepAnim = {
    initial: canAnimate ? { opacity: 0, x: 16 } : false,
    animate: { opacity: 1, x: 0 },
    exit: canAnimate ? { opacity: 0, x: -16 } : {},
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="card p-6">
        {/* progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Step {step + 1} of {STEPS.length} · {STEPS[step]}</span>
            <span>~{EST_MINUTES} min total</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel2">
            <motion.div
              className="h-full rounded-full bg-brand"
              animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {STEPS.map((s, i) => (
              <button
                key={s}
                onClick={() => i <= step && setStep(i)}
                disabled={i > step}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  i === step
                    ? "border-brand/50 bg-brand/15 text-brand"
                    : i < step
                    ? "border-edge bg-panel2 text-slate-300 hover:border-slate-500"
                    : "border-edge/50 text-slate-600"
                }`}
              >
                {i < step ? "✓ " : ""}{s}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={step} {...stepAnim}>
            {step === 0 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-white">How much are you investing?</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    A model predicts which funds are likely to cut their payout; an optimizer then builds your
                    plan from what's left. Start with your budget and, if you have one, an income target.
                  </p>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Amount to invest" tip="Your lump-sum budget. The optimizer sizes every holding to whole shares from this amount — it doesn't model recurring monthly contributions.">
                    <div className="flex items-center">
                      <span className="mr-1 text-slate-400">$</span>
                      <input className="input w-full" type="number" min="1000" step="1000" value={budget} onChange={(e) => setBudget(e.target.value)} />
                    </div>
                    {!validBudget && <p className="mt-1 text-[11px] text-rose-300">Enter an amount above $0.</p>}
                  </Field>
                  <Field label="Monthly income goal (optional)" tip="A target we'll check each plan against on the results page — it doesn't change the optimization itself, just flags which plans reach it.">
                    <div className="flex items-center">
                      <span className="mr-1 text-slate-400">$</span>
                      <input className="input w-full" type="number" min="0" step="50" placeholder="e.g. 300" value={incomeGoal ?? ""} onChange={(e) => setIncomeGoal(e.target.value)} />
                    </div>
                  </Field>
                </div>
                <Field label="Time horizon" tip="Longer horizons let the optimizer take on more of the risk budget — gains taper off past a few years, so very long horizons behave similarly.">
                  <select className="input w-full sm:w-64" value={horizon} onChange={(e) => setHorizon(e.target.value)}>
                    {HORIZONS.map((h) => <option key={h.v} value={h.v}>{h.label}</option>)}
                  </select>
                </Field>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-white">How much risk feels right?</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    These controls shape every plan's diversification. Defaults work well — adjust only if you
                    have a preference.
                  </p>
                </div>
                <Field label={`Risk tolerance · max ${maxWeight}% per fund`} tip="Caps how much of your money can sit in any single fund. Lower = more diversified and steadier; higher = more concentrated, which can swing further either way.">
                  <input className="mt-2 w-full accent-brand" type="range" min="10" max="50" step="5" value={maxWeight} onChange={(e) => setMaxWeight(Number(e.target.value))} />
                  <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                    <span>Conservative</span>
                    <span>Aggressive</span>
                  </div>
                </Field>
                <Field label="Max funds in a plan (optional)" tip="Cap how many funds a single plan can hold, so it stays easy to manage.">
                  <input className="input w-full sm:w-48" type="number" min="3" max="40" placeholder="No limit" value={maxFunds} onChange={(e) => setMaxFunds(e.target.value)} />
                </Field>
                <Field label="Category caps (optional)" tip="Limit how much of a plan can come from one fund category, e.g. cap covered-call exposure.">
                  <div className="grid grid-cols-2 gap-2 sm:w-96">
                    {CATEGORIES.map(([key, name]) => (
                      <div key={key} className="flex items-center gap-1.5">
                        <input className="input w-16 px-2 py-1 text-sm" type="number" min="0" max="100" placeholder="—" value={catCaps[key] ?? ""} onChange={(e) => setCap(key, e.target.value)} />
                        <span className="text-[11px] text-slate-400">% {name}</span>
                      </div>
                    ))}
                  </div>
                </Field>

                <div className="border-t border-edge pt-4">
                  <button onClick={() => setShowFundPicker((v) => !v)} className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white">
                    <span className={`transition-transform ${showFundPicker ? "rotate-90" : ""}`}>▸</span>
                    Fine-tune specific funds (optional)
                  </button>
                  {showFundPicker && (
                    <div className="mt-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-[11px] text-slate-500">Pin forces a fund into consideration; drop excludes it entirely.</p>
                        <input className="input w-48 px-3 py-1.5 text-sm" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        {CATEGORIES.map(([key, name]) => {
                          const all = grouped[key] || [];
                          const list = match(all);
                          if (q && list.length === 0) return null;
                          const expanded = q ? true : !!open[key];
                          return (
                            <div key={key} className="overflow-hidden rounded-xl border border-edge">
                              <div className="flex items-center justify-between bg-panel2 px-3 py-2">
                                <button className="flex items-center gap-2 text-sm font-medium text-slate-100" onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}>
                                  <span className="text-slate-500">{expanded ? "▾" : "▸"}</span>
                                  {name} <span className="text-xs font-normal text-slate-500">· {all.length}</span>
                                </button>
                                <div className="flex items-center gap-2 text-xs">
                                  <button className="text-emerald-300 hover:underline" onClick={() => bulk(all, "include")}>Pin all</button>
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
                                      </div>
                                      <div className="flex shrink-0 items-center gap-2">
                                        <RiskBadge risk={e.risk_category} eligible={e.eligible} screenReason={e.screen_reason} />
                                        <div className="flex overflow-hidden rounded-lg border border-edge">
                                          <SegBtn active={sel[e.ticker] === "include"} color="emerald" onClick={() => setOne(e.ticker, "include")}>Pin</SegBtn>
                                          <SegBtn active={sel[e.ticker] === "exclude"} color="rose" onClick={() => setOne(e.ticker, "exclude")}>Drop</SegBtn>
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
                  )}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-white">Do you hold any tax-advantaged accounts?</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Optional — tell us your contribution room and we'll show how to split each plan to shelter
                    the most heavily taxed income first.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {REGISTERED.map(([key, name]) => (
                    <div key={key} className="rounded-xl border border-edge bg-panel2 p-3">
                      <label className="flex items-center gap-2 text-sm text-slate-200">
                        <input type="checkbox" className="accent-brand" checked={!!acctHeld[key]} onChange={() => toggleAcct(key)} />
                        {name}
                      </label>
                      {acctHeld[key] && (
                        <div className="mt-2 flex items-center">
                          <span className="mr-1 text-slate-400">$</span>
                          <input className="input w-full px-2 py-1 text-sm" type="number" min="0" step="500" placeholder="room" value={acctRoom[key] ?? ""} onChange={(e) => setAcctRoom((r) => ({ ...r, [key]: e.target.value }))} />
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="rounded-xl border border-edge bg-panel2 p-3">
                    <label className="flex items-center gap-2 text-sm text-slate-200">
                      <input type="checkbox" className="accent-brand" checked={!!acctHeld.non_registered} onChange={() => toggleAcct("non_registered")} />
                      Non-registered
                    </label>
                    <p className="mt-2 text-[11px] text-slate-500">Taxable account for any overflow.</p>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-white">Ready to generate your plan</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    We'll screen the fund universe, then build Safe, Balanced, and High-risk versions of your
                    plan so you can compare trade-offs.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <ReviewStat label="Investing" value={money(Number(budget) || 0)} />
                  <ReviewStat label="Horizon" value={HORIZONS.find((h) => h.v === Number(horizon))?.label} />
                  <ReviewStat label="Max per fund" value={`${maxWeight}%`} />
                  <ReviewStat label="Accounts" value={acctCount ? `${acctCount} selected` : "None"} />
                </div>
                {(include.length > 0 || exclude.length > 0) && (
                  <p className="text-xs text-slate-500">
                    {include.length > 0 && <>Pinned: {include.map((t) => t.replace(".TO", "")).join(", ")}. </>}
                    {exclude.length > 0 && <>Dropped: {exclude.map((t) => t.replace(".TO", "")).join(", ")}.</>}
                  </p>
                )}
                <button className="btn-primary w-full sm:w-auto" onClick={submit} disabled={loading || !validBudget}>
                  {loading ? "Building your plan…" : ctaLabel}
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* nav */}
        <div className="mt-8 flex items-center justify-between border-t border-edge pt-4">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-full border border-edge px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 disabled:opacity-0"
          >
            ← Back
          </button>
          {step < STEPS.length - 1 && (
            <button
              onClick={() => canAdvance && setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              disabled={!canAdvance}
              className="btn-primary"
            >
              Continue →
            </button>
          )}
        </div>
      </section>

      {/* live summary */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="card p-5">
          <div className="label mb-3">Your plan so far</div>
          <div className="space-y-3 text-sm">
            <SummaryRow label="Investment amount" value={validBudget ? money(Number(budget)) : "—"} />
            <SummaryRow label="Time horizon" value={HORIZONS.find((h) => h.v === Number(horizon))?.label} />
            <SummaryRow label="Monthly goal" value={incomeGoal ? money(Number(incomeGoal)) : "No target set"} />
            <SummaryRow label="Risk tolerance" value={`${maxWeight}% max per fund`} />
            <SummaryRow label="Accounts" value={acctCount ? `${acctCount} selected` : "Taxable only"} />
            <div className="border-t border-edge pt-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">Closest portfolio style</div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className={`text-base font-semibold ${portfolioType === "Safe" ? "text-emerald-300" : portfolioType === "Balanced" ? "text-sky-300" : "text-amber-300"}`}>
                  {portfolioType}
                </span>
                <InfoTip label="Closest portfolio style" side="right">
                  A live preview based on your risk tolerance and horizon — not the final assignment. You'll get
                  all three plans (Safe, Balanced, High-risk) to compare once you generate.
                </InfoTip>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, tip, children }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <label className="label">{label}</label>
        {tip && <InfoTip label={label}>{tip}</InfoTip>}
      </div>
      {children}
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-medium text-slate-100">{value}</span>
    </div>
  );
}

function ReviewStat({ label, value }) {
  return (
    <div className="rounded-xl border border-edge bg-panel2 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 font-semibold text-white">{value}</div>
    </div>
  );
}

function SegBtn({ active, color, onClick, children }) {
  const on = color === "emerald" ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200";
  return (
    <button onClick={onClick} className={`px-3 py-1 text-xs font-medium transition ${active ? on : "text-slate-400 hover:bg-panel2"}`}>
      {children}
    </button>
  );
}

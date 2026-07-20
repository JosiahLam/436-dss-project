import { RISK_STYLES, riskLabel } from "../lib/format";

// Rank-based bucket meanings (tied to the validated 60%-avoidance operating point).
// Shown as Low/Medium/High cut risk — see riskLabel().
const RISK_TOOLTIP = {
  Risky: "Top 25% predicted cut risk — excluded from every plan (historically blocks ~6 of 10 real cuts)",
  Watch: "Next 15% predicted cut risk — allowed in plans, but capped at a small weight",
  Safe: "Lower predicted cut risk — no cap",
};

// Months of history Module-1 requires (config.MIN_AGE_MONTHS).
const REQUIRED_MONTHS = 36;

// Turn a raw Module-1 screen_reason into a human tooltip. Screened-out funds are
// "Not rated" — the model deliberately did not assign a risk bucket — which is
// distinct from being rated low-risk.
function screenTooltip(reason) {
  const r = (reason || "").toLowerCase();
  if (r.includes("leverage")) {
    return "Not rated — uses leverage, outside this DSS's scope";
  }
  const m = r.match(/\((\d+)\s*m/);
  if (r.includes("too new") || m) {
    const months = m ? m[1] : "too few";
    return `Not rated — only ${months} of ${REQUIRED_MONTHS} required months of history`;
  }
  return reason ? `Not rated — screened out (${reason})` : "Not rated — screened out";
}

export default function RiskBadge({ risk, eligible = true, screenReason }) {
  // Ineligible (Module-1 screened) funds show a neutral "Not rated" badge
  // instead of a Low/Medium/High cut-risk rating.
  if (eligible === false || eligible === 0) {
    return (
      <span
        title={screenTooltip(screenReason)}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-600/50 bg-slate-700/40 px-2 py-0.5 text-xs font-medium text-slate-300"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        Not rated
      </span>
    );
  }

  const s = RISK_STYLES[risk] || RISK_STYLES.Watch;
  return (
    <span
      title={RISK_TOOLTIP[risk] || ""}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${s.ring} ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {riskLabel(risk)}
    </span>
  );
}

import { RISK_STYLES } from "../lib/format";

// Rank-based bucket meanings (tied to the validated 60%-avoidance operating point).
const RISK_TOOLTIP = {
  Risky: "top 25% cut risk — excluded (historically blocks ~6 of 10 cuts)",
  Watch: "next 15% — weight-capped",
  Safe: "lower cut risk — eligible without a cap",
};

export default function RiskBadge({ risk }) {
  const s = RISK_STYLES[risk] || RISK_STYLES.Watch;
  return (
    <span
      title={RISK_TOOLTIP[risk] || ""}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${s.ring} ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {risk}
    </span>
  );
}

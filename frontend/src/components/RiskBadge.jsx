import { RISK_STYLES } from "../lib/format";

export default function RiskBadge({ risk }) {
  const s = RISK_STYLES[risk] || RISK_STYLES.Watch;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${s.ring} ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {risk}
    </span>
  );
}

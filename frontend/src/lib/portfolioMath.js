// Diversification score (0-100) from the Herfindahl-Hirschman Index of
// holding weights: 100 = perfectly spread across many funds, lower = more
// concentrated in a few. Real, derived from actual weights — not a separate
// model output.
export function diversificationScore(holdings) {
  if (!holdings?.length) return 0;
  const hhi = holdings.reduce((s, h) => s + h.weight * h.weight, 0);
  if (hhi <= 0) return 0;
  const effectiveN = 1 / hhi; // "effective number of equally-weighted funds"
  // Effective N as a fraction of actual holding count: 100 = perfectly equal
  // weight across every holding, lower = a few names dominate the plan.
  return Math.round(Math.min(100, (effectiveN / holdings.length) * 100));
}

// Qualitative risk label for a plan's volatility, relative to the other
// plans in the same set (so "High" always means highest of the three shown).
export function riskLevelLabel(volatility, allVolatilities) {
  const sorted = [...allVolatilities].sort((a, b) => a - b);
  const idx = sorted.indexOf(volatility);
  if (sorted.length <= 1) return "Medium";
  const frac = idx / (sorted.length - 1);
  if (frac < 0.34) return "Low";
  if (frac < 0.67) return "Medium";
  return "High";
}

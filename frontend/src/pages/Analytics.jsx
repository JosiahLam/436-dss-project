import { usePerch } from "../context/PerchContext";
import EtfMap from "../components/EtfMap";
import RiskReturnScatter from "../components/RiskReturnScatter";
import UniverseExplorer from "../components/UniverseExplorer";
import DividendScore from "../components/DividendScore";
import CategoryBreakdown from "../components/CategoryBreakdown";

export default function Analytics() {
  const { etfs, hasData, openEtf } = usePerch();

  if (!hasData) return <p className="text-slate-400">Loading the fund universe…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Analytics</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Explore every scored fund to find ones that fit your goals. Each chart answers a specific
          question — hover for detail, click any fund to open its full breakdown.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <EtfMap etfs={etfs} onSelect={openEtf} />
        <RiskReturnScatter etfs={etfs} onSelect={openEtf} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryBreakdown etfs={etfs} />
        <DividendScore etfs={etfs} onSelect={openEtf} />
      </div>

      <UniverseExplorer etfs={etfs} onSelect={openEtf} />
    </div>
  );
}

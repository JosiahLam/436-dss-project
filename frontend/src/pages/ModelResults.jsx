import { usePerch } from "../context/PerchContext";
import ModelPerformance from "../components/ModelPerformance";
import EtfMap from "../components/EtfMap";
import UniverseTable from "../components/UniverseTable";

export default function ModelResults() {
  const { runInfo, etfs, hasData, flaggedCount, openEtf } = usePerch();

  if (!hasData) return <p className="text-slate-400">Loading model results…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Model results</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Why Perch trusts some funds and flags others. Start with how the model performs, then see every
          fund on the risk map — click any one for its plain-English reasons.
        </p>
      </div>

      <ModelPerformance runInfo={runInfo} flaggedCount={flaggedCount} />

      <EtfMap etfs={etfs} onSelect={openEtf} />

      <UniverseTable etfs={etfs} onSelect={openEtf} />
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { api } from "./lib/api";
import Header from "./components/Header";
import PlanBuilder from "./components/PlanBuilder";
import PlanCard from "./components/PlanCard";
import FrontierChart from "./components/FrontierChart";
import EtfMap from "./components/EtfMap";
import UniverseTable from "./components/UniverseTable";
import EtfDetail from "./components/EtfDetail";

const fmtMetric = (v) => (v == null ? "—" : v.toFixed(2));

export default function App() {
  const [runInfo, setRunInfo] = useState(null);
  const [universe, setUniverse] = useState(null);
  const [plans, setPlans] = useState(null);
  const [budget, setBudget] = useState(50000);
  const [selected, setSelected] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState(null);

  const buildPlans = useCallback(async (body) => {
    setOptimizing(true);
    setError(null);
    try {
      setPlans(await api.plans(body));
    } catch (e) {
      setError(e.message);
      setPlans(null);
    } finally {
      setOptimizing(false);
    }
  }, []);

  const load = useCallback(async () => {
    const [info, uni] = await Promise.all([api.runInfo(), api.universe()]);
    setRunInfo(info);
    setUniverse(uni);
    if (uni.etfs?.length) buildPlans({ budget: 50000, include: [], exclude: [] });
  }, [buildPlans]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await api.refresh(false); // tries live Yahoo, falls back to synthetic
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  const hasData = universe?.etfs?.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Header runInfo={runInfo} onRefresh={refresh} refreshing={refreshing} />

      {error && (
        <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {runInfo && !hasData && !refreshing && (
        <div className="card mt-6 p-8 text-center">
          <p className="text-slate-300">No scores yet. Run the pipeline to ingest data and score the ETF universe.</p>
          <button className="btn-primary mt-4" onClick={refresh}>Run pipeline</button>
        </div>
      )}

      {hasData && (
        <>
          {/* Model-quality strip (the monitoring numbers) */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard label="Model AUC" value={fmtMetric(runInfo?.model_auc)} hint="gradient boosting, test fold" />
            <MetricCard label="Baseline AUC" value={fmtMetric(runInfo?.baseline_auc)} hint="logistic regression" />
            <MetricCard label="Rule AUC" value={fmtMetric(runInfo?.rule_auc)} hint="“payout falling” benchmark" />
            <MetricCard label="Risky precision" value={fmtMetric(runInfo?.risky_precision)} hint="of flagged, share that cut" />
          </div>

          <div className="mt-6 space-y-6">
            <PlanBuilder
              etfs={universe.etfs}
              onBuild={buildPlans}
              loading={optimizing}
              budget={budget}
              setBudget={setBudget}
            />

            {plans && (
              <>
                <div className="grid gap-4 lg:grid-cols-3">
                  {plans.plans.map((p) => (
                    <PlanCard key={p.name} plan={p} onSelectEtf={setSelected} />
                  ))}
                </div>
                {plans.excluded_risky?.length > 0 && (
                  <p className="text-sm text-slate-400">
                    Excluded as Risky (likely to cut):{" "}
                    <span className="text-rose-300">
                      {plans.excluded_risky.map((t) => t.replace(".TO", "")).join(", ")}
                    </span>
                  </p>
                )}
                <FrontierChart frontier={plans.frontier} plans={plans.plans} />
              </>
            )}

            <EtfMap etfs={universe.etfs} onSelect={setSelected} />

            <UniverseTable etfs={universe.etfs} onSelect={setSelected} />
          </div>
        </>
      )}

      <footer className="mt-10 border-t border-edge pt-4 text-center text-xs text-slate-500">
        Perch · educational decision-support prototype · not investment advice.
      </footer>

      {selected && <EtfDetail ticker={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="card px-4 py-3">
      <div className="label">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold text-white">{value}</div>
      <div className="text-[11px] text-slate-500">{hint}</div>
    </div>
  );
}

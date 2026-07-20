import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

const PerchContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export function usePerch() {
  const ctx = useContext(PerchContext);
  if (!ctx) throw new Error("usePerch must be used inside <PerchProvider>");
  return ctx;
}

const DEFAULT_INPUTS = { budget: 50000, include: [], exclude: [] };

export function PerchProvider({ children }) {
  const [runInfo, setRunInfo] = useState(null);
  const [universe, setUniverse] = useState(null);
  const [plans, setPlans] = useState(null);
  const [planInputs, setPlanInputs] = useState(DEFAULT_INPUTS);
  const [budget, setBudget] = useState(50000);
  const [incomeGoal, setIncomeGoal] = useState("");   // client-side monthly target
  const [selected, setSelected] = useState(null);      // ticker for the global EtfDetail modal
  const [savedScenario, setSavedScenario] = useState(null); // { label, plans } for A/B compare
  const [refreshing, setRefreshing] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const buildPlans = useCallback(
    async (body, notify = false) => {
      setOptimizing(true);
      setError(null);
      try {
        const result = await api.plans(body);
        setPlans(result);
        setPlanInputs(body);
        if (notify) showToast("3 plans built — see your recommendation.");
        return result;
      } catch (e) {
        setError(e.message);
        setPlans(null);
        throw e;
      } finally {
        setOptimizing(false);
      }
    },
    [showToast]
  );

  const load = useCallback(async () => {
    const [info, uni] = await Promise.all([api.runInfo(), api.universe()]);
    setRunInfo(info);
    setUniverse(uni);
    if (uni.etfs?.length) buildPlans(DEFAULT_INPUTS).catch(() => {});
  }, [buildPlans]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await api.refresh(false); // tries live Yahoo, falls back to synthetic
      await load();
      showToast(`Pipeline re-run — ${res.n_etfs} funds scored (${res.data_source}).`);
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, [load, showToast]);

  const openEtf = useCallback((ticker) => setSelected(ticker), []);
  const closeEtf = useCallback(() => setSelected(null), []);

  const saveScenario = useCallback(() => {
    if (!plans) return;
    setSavedScenario({ label: `$${Number(planInputs.budget).toLocaleString()} plan`, plans, inputs: planInputs });
    showToast("Scenario saved — change inputs to compare.");
  }, [plans, planInputs, showToast]);
  const clearScenario = useCallback(() => setSavedScenario(null), []);

  const etfs = universe?.etfs ?? [];
  const hasData = etfs.length > 0;
  const flaggedCount = hasData ? etfs.filter((e) => e.risk_category === "Risky").length : null;

  const value = {
    // data
    runInfo, universe, etfs, plans, planInputs, hasData, flaggedCount,
    budget, setBudget, incomeGoal, setIncomeGoal,
    selected, savedScenario,
    // status
    refreshing, optimizing, error, toast, setToast,
    // actions
    buildPlans, refresh, openEtf, closeEtf, showToast, saveScenario, clearScenario,
  };

  return <PerchContext.Provider value={value}>{children}</PerchContext.Provider>;
}

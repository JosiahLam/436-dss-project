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

  const openEtf = useCallback((ticker) => setSelected(ticker), []);
  const closeEtf = useCallback(() => setSelected(null), []);

  const etfs = universe?.etfs ?? [];
  const hasData = etfs.length > 0;
  const flaggedCount = hasData ? etfs.filter((e) => e.risk_category === "Risky").length : null;

  const value = {
    // data
    runInfo, universe, etfs, plans, planInputs, hasData, flaggedCount,
    budget, setBudget, incomeGoal, setIncomeGoal,
    selected,
    // status
    optimizing, error, toast, setToast,
    // actions
    buildPlans, openEtf, closeEtf, showToast,
  };

  return <PerchContext.Provider value={value}>{children}</PerchContext.Provider>;
}

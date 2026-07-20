import { Outlet } from "react-router-dom";
import { usePerch } from "../context/PerchContext";
import { useLenis } from "../hooks/useLenis";
import NavBar from "./NavBar";
import EtfDetail from "./EtfDetail";

export default function AppLayout() {
  const { toast, setToast, error, selected, closeEtf } = usePerch();
  useLenis();

  return (
    <div className="min-h-screen overflow-x-hidden">
      <NavBar />

      {toast && (
        <div className="fixed right-4 top-16 z-[60] flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-panel2 px-4 py-3 text-sm text-slate-100 shadow-lg">
          <span className="text-emerald-300">✓</span>
          <span>{toast}</span>
          <button onClick={() => setToast(null)} aria-label="Dismiss" className="ml-2 text-slate-400 hover:text-slate-100">
            ✕
          </button>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6">
        {error && (
          <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}
        <Outlet />
      </main>

      <footer className="mx-auto max-w-6xl border-t border-edge px-4 py-6 text-center text-xs text-slate-500">
        Perch · educational decision-support prototype · not investment advice.
      </footer>

      {selected && <EtfDetail ticker={selected} onClose={closeEtf} />}
    </div>
  );
}

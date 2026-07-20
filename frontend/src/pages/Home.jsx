import { Link } from "react-router-dom";
import { usePerch } from "../context/PerchContext";

const FEATURES = [
  ["Predicts dividend cuts", "A model flags funds likely to cut their payout in the next year."],
  ["Screens out the risky ones", "The funds most likely to cut are set aside before anything is recommended."],
  ["Builds 3 ready plans", "Safe, Balanced, and High-risk portfolios — with exact shares and monthly income."],
  ["Tax-smart account split", "Shows how to place funds across TFSA / RRSP / FHSA to keep more of your income."],
  ["Explains every pick", "Plain-English reasons for each score and each recommendation — no black boxes."],
  ["Explore the whole universe", "Filter, sort, and search dozens of Canadian income ETFs in one place."],
];

const STEPS = [
  ["1", "Explore", "See every fund scored for cut risk and yield."],
  ["2", "Build", "Set your budget, horizon, and preferences."],
  ["3", "See the picks", "Check why the model trusts (or flags) each fund."],
  ["4", "Get 3 plans", "Compare ready-to-invest portfolios and pick one."],
];

export default function Home() {
  const { runInfo } = usePerch();

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="card overflow-hidden p-8">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-edge bg-panel2 px-3 py-1 text-xs text-slate-300">
            🪺 Perch · dividend-ETF decision support
          </span>
          <h1 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-4xl">
            Steady monthly income, without hours of research.
          </h1>
          <p className="mt-3 text-base text-slate-300">
            Perch helps beginner investors build a dividend-ETF portfolio for steady monthly income. It
            predicts which ETFs are likely to cut their dividend, drops the risky ones, and builds three
            ready-to-invest plans — turning hours of research into an instant, transparent plan.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/build" className="btn-primary">Build my income plan</Link>
            <Link to="/analytics" className="btn-ghost">Explore the funds</Link>
          </div>
          {runInfo?.run_date && (
            <p className="mt-4 text-xs text-slate-500">
              Funds last scored {runInfo.run_date} · {runInfo.n_etfs ?? "—"} ETFs ·{" "}
              {runInfo.data_source === "yahoo" ? "live market data" : "demo (synthetic) data"}.
            </p>
          )}
        </div>
      </section>

      {/* Overview / Problem / Users */}
      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard title="What it is">
          A decision support system that turns dozens of Canadian income ETFs and a dividend-cut model into
          three clear, ready-to-invest plans.
        </InfoCard>
        <InfoCard title="The problem">
          Chasing the highest yield often backfires — those funds are the most likely to cut their payout.
          Sorting the safe income from the traps takes hours and finance know-how most beginners don't have.
        </InfoCard>
        <InfoCard title="Who it's for">
          Beginner Canadian investors and students who want dependable monthly income and a plan they can act
          on today — not a finance degree.
        </InfoCard>
      </div>

      {/* Key features */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold text-white">What Perch does</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([t, d]) => (
            <div key={t}>
              <div className="text-sm font-medium text-slate-100">{t}</div>
              <p className="mt-1 text-sm text-slate-400">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold text-white">How it works</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([n, t, d]) => (
            <div key={n} className="rounded-xl border border-edge bg-panel2 p-4">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand/15 text-sm font-semibold text-brand">
                {n}
              </div>
              <div className="mt-3 text-sm font-medium text-slate-100">{t}</div>
              <p className="mt-1 text-[13px] text-slate-400">{d}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/build" className="btn-primary">Start building</Link>
          <Link to="/model" className="btn-ghost">See how the model performs</Link>
        </div>
      </section>

      <p className="text-center text-xs text-slate-500">
        Perch is an educational prototype — not investment advice.
      </p>
    </div>
  );
}

function InfoCard({ title, children }) {
  return (
    <div className="card p-5">
      <div className="label">{title}</div>
      <p className="mt-2 text-sm text-slate-300">{children}</p>
    </div>
  );
}

import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";

const LINKS = [
  ["/", "Home"],
  ["/build", "Build Plan"],
  ["/recommendation", "Recommendation"],
  ["/analytics", "Analytics"],
];

export default function NavBar() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-edge bg-ink/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <NavLink to="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand/15 text-lg">🪺</span>
          <span className="text-lg font-semibold text-white">Perch</span>
        </NavLink>

        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {LINKS.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"} className="relative rounded-lg px-3 py-1.5">
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-active-pill"
                      className="absolute inset-0 rounded-lg bg-brand/15 ring-1 ring-brand/25"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span
                    className={`relative transition-colors ${
                      isActive ? "font-medium text-brand" : "text-slate-400 hover:text-slate-100"
                    }`}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}

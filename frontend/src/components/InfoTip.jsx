import { useState, useId } from "react";

// Small ⓘ that explains a technical term on hover or focus.
// Keyboard accessible and screen-reader friendly.
export default function InfoTip({ label, children, side = "top" }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const pos =
    side === "right"
      ? "left-full top-1/2 ml-2 -translate-y-1/2"
      : side === "bottom"
      ? "top-full left-1/2 mt-2 -translate-x-1/2"
      : "bottom-full left-1/2 mb-2 -translate-x-1/2";

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label ? `What is ${label}?` : "More information"}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="grid h-3.5 w-3.5 place-items-center rounded-full border border-slate-600 text-[9px] leading-none text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
      >
        i
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`absolute z-50 w-56 rounded-lg border border-edge bg-panel2 px-3 py-2 text-[11px] font-normal normal-case leading-5 tracking-normal text-slate-300 shadow-xl ${pos}`}
        >
          {children}
        </span>
      )}
    </span>
  );
}

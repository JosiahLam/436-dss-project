import { useEffect, useState } from "react";

// True when the user has asked the OS to minimize motion, or on coarse-pointer
// (touch) devices where the cursor-driven effects don't apply. Heavy effects
// should bail out when this is true.
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(pointer: coarse)");
    const update = () => setReduced(motion.matches || coarse.matches);
    update();
    motion.addEventListener("change", update);
    coarse.addEventListener("change", update);
    return () => {
      motion.removeEventListener("change", update);
      coarse.removeEventListener("change", update);
    };
  }, []);

  return reduced;
}
